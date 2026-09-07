const WEATHER_ICON_BASE = '/images/weather';

function getWeatherIcon(weatherText) {
  const text = String(weatherText || '').trim();
  if (text.includes('雪') || text.includes('冻雨')) return `${WEATHER_ICON_BASE}/snow.png`;
  if (text.includes('雷') || text.includes('雨') || text.includes('冰雹')) return `${WEATHER_ICON_BASE}/rain.png`;
  if (text.includes('雾') || text.includes('霾') || text.includes('沙') || text.includes('尘')) return `${WEATHER_ICON_BASE}/fog.png`;
  if (text.includes('阴')) return `${WEATHER_ICON_BASE}/overcast.png`;
  if (text.includes('多云') || text.includes('少云')) return `${WEATHER_ICON_BASE}/cloudy.png`;
  if (text.includes('晴')) return `${WEATHER_ICON_BASE}/sunny.png`;
  return `${WEATHER_ICON_BASE}/cloudy.png`;
}

module.exports = { getWeatherIcon };
