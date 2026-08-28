function getWeatherEmoji(weatherText) {
  const text = String(weatherText || '').trim();
  if (text.includes('雷')) return '⛈️';
  if (text.includes('雪')) return '❄️';
  if (text.includes('雾') || text.includes('霾')) return '🌫️';
  if (text.includes('毛毛雨') || text.includes('阵雨')) return '🌦️';
  if (text.includes('雨')) return '🌧️';
  if (text.includes('晴间多云')) return '🌤️';
  if (text.includes('多云')) return '⛅';
  if (text.includes('阴')) return '☁️';
  if (text.includes('晴')) return '☀️';
  return '🌥️';
}

module.exports = { getWeatherEmoji };
