/**
 * Crawlers that render link previews. They get the embed HTML; everyone else
 * gets redirected to dcinside so a mis-clicked link still works.
 */
const BOT_PATTERNS = [
  'discordbot',
  'telegrambot',
  'twitterbot',
  'slackbot',
  'slack-imgproxy',
  'facebookexternalhit',
  'facebookcatalog',
  'whatsapp',
  'skypeuripreview',
  'linkedinbot',
  'redditbot',
  'embedly',
  'iframely',
  'quora link preview',
  'nuzzel',
  'vkshare',
  'outbrain',
  'pinterest',
  'bitlybot',
  'applebot',
  'googlebot',
  'bingbot',
  'yeti', // Naver
  'daumoa', // Kakao
  'kakaotalk-scrap',
  'line-podcast',
  'mastodon',
  'akkoma',
  'misskey',
  'pleroma',
  'element',
  'synapse',
  'matrix',
  'revoltchat',
  'guildedbot',
  'opengraph',
  'metainspector',
  'preview',
];

export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true; // No UA at all is almost always a scraper.
  const ua = userAgent.toLowerCase();
  return BOT_PATTERNS.some((pattern) => ua.includes(pattern));
}
