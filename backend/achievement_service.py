"""成就中心结算服务。

该模块不提交事务。调用方必须把有效参与、抽奖记录、成就和实物奖励放在同一事务中。
"""
import secrets


def _new_reward_code():
    return f'ACH-{secrets.token_hex(14).upper()}'


def count_valid_attendance(cursor, user_openid, lock=False):
    selection = 'aa.activity_id' if lock else 'COUNT(*) AS count'
    locking = 'FOR UPDATE' if lock else ''
    cursor.execute(f"""
        SELECT {selection}
        FROM achievement_attendance aa
        JOIN activities a ON a.id = aa.activity_id
        WHERE aa.user_openid = %s AND aa.status = 1 AND a.is_official = 1
          AND a.status IN (1, 3, 4)
        {locking}
    """, (user_openid,))
    # 锁定读避免同一事务先前的快照漏掉另一场刚提交的活动参与。
    return len(cursor.fetchall()) if lock else int((cursor.fetchone() or {}).get('count') or 0)


def _create_physical_reward(cursor, user_openid, achievement, activity_id):
    """为首次获得的实物里程碑生成一条通用核销奖品。"""
    for _ in range(5):
        redeem_code = _new_reward_code()
        cursor.execute(
            'SELECT 1 FROM lottery_redemptions WHERE redeem_code = %s LIMIT 1',
            (redeem_code,),
        )
        if cursor.fetchone():
            continue
        cursor.execute(
            'SELECT 1 FROM achievement_rewards WHERE redeem_code = %s LIMIT 1',
            (redeem_code,),
        )
        if cursor.fetchone():
            continue
        cursor.execute("""
            INSERT IGNORE INTO achievement_rewards
                (user_openid, achievement_id, source_activity_id, prize_name,
                 image_url, claim_instructions, pickup_location, redeem_code)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            user_openid,
            achievement['id'],
            activity_id,
            achievement.get('reward_name') or f"{achievement['name']}实体徽章",
            achievement.get('image_url') or '',
            achievement.get('claim_instructions') or '请联系步步出沪工作人员领取实体徽章。',
            achievement.get('pickup_location') or '',
            redeem_code,
        ))
        if cursor.rowcount == 1:
            return {'reward_id': cursor.lastrowid, 'redeem_code': redeem_code}
        cursor.execute("""
            SELECT id FROM achievement_rewards
            WHERE user_openid = %s AND achievement_id = %s FOR UPDATE
        """, (user_openid, achievement['id']))
        if cursor.fetchone():
            # 已存在的 user + achievement 唯一记录无需重复发奖。
            return None
        # 核销码碰撞时继续生成，不能把未发奖误判为“已经发过”。
    raise RuntimeError('生成唯一成就奖品核销码失败')


def _unlock(cursor, user_openid, achievement, activity_id, source_type):
    cursor.execute("""
        INSERT IGNORE INTO user_achievements
            (user_openid, achievement_id, source_activity_id, source_type, obtained_at)
        VALUES (%s, %s, %s, %s, NOW())
    """, (user_openid, achievement['id'], activity_id, source_type))
    if cursor.rowcount != 1:
        return None

    item = {
        'id': achievement['id'],
        'code': achievement['code'],
        'name': achievement['name'],
        'image_url': achievement['image_url'],
        'is_physical': int(achievement.get('is_physical') or 0),
        'reward': None,
    }
    if item['is_physical']:
        item['reward'] = _create_physical_reward(
            cursor, user_openid, achievement, activity_id,
        )
    return item


def settle_achievements_after_draw(cursor, user_openid, activity_id, lottery_id, record_id):
    """抽奖口令验证成功后进行幂等成就结算。"""
    # 不同活动的抽奖可并发，按用户串行结算，确保累计次数与阈值判断一致。
    cursor.execute('SELECT openId FROM users WHERE openId = %s FOR UPDATE', (user_openid,))
    if not cursor.fetchone():
        raise ValueError('成就结算用户不存在')
    cursor.execute(
        'SELECT is_official, status FROM activities WHERE id = %s',
        (activity_id,),
    )
    activity = cursor.fetchone()
    if (not activity or int(activity.get('is_official') or 0) != 1
            or int(activity.get('status') or 0) not in (1, 3, 4)):
        return {
            'attendance_count': count_valid_attendance(cursor, user_openid, lock=True),
            'attendance_added': False,
            'new_achievements': [],
        }

    cursor.execute("""
        INSERT IGNORE INTO achievement_attendance
            (user_openid, activity_id, first_lottery_id, first_record_id, verified_at, status)
        VALUES (%s, %s, %s, %s, NOW(), 1)
    """, (user_openid, activity_id, lottery_id, record_id))
    attendance_added = cursor.rowcount == 1
    attendance_count = count_valid_attendance(cursor, user_openid, lock=True)

    cursor.execute("""
        SELECT id, code, name, description, image_url, threshold_count,
               is_physical, reward_name, claim_instructions, pickup_location
        FROM achievement_definitions
        WHERE achievement_type = 1 AND is_active = 1 AND threshold_count <= %s
        ORDER BY threshold_count ASC, id ASC
    """, (attendance_count,))
    candidates = [(item, 'milestone') for item in cursor.fetchall()]

    cursor.execute("""
        SELECT d.id, d.code, d.name, d.description, d.image_url, d.threshold_count,
               d.is_physical, d.reward_name, d.claim_instructions, d.pickup_location
        FROM achievement_activity_relations rel
        JOIN achievement_definitions d ON d.id = rel.achievement_id
        WHERE rel.activity_id = %s AND rel.is_active = 1
          AND d.achievement_type = 2 AND d.is_active = 1
        ORDER BY d.sort_order ASC, d.id ASC
    """, (activity_id,))
    candidates.extend((item, 'event') for item in cursor.fetchall())

    new_achievements = []
    for achievement, source_type in candidates:
        unlocked = _unlock(
            cursor, user_openid, achievement, activity_id, source_type,
        )
        if unlocked:
            new_achievements.append(unlocked)

    return {
        'attendance_count': attendance_count,
        'attendance_added': attendance_added,
        'new_achievements': new_achievements,
    }
