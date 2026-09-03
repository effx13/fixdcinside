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

/**
 * Discord gets a different page: no media tags at all, plus an
 * application/activity+json link. Given an og:image it renders its own link
 * embed and never follows that link, and that embed has no footer, no avatar
 * and room for one picture. Without one it follows the link and uses its
 * Mastodon renderer, which has all three.
 */
export function isDiscord(userAgent: string | null | undefined): boolean {
  return (userAgent ?? '').includes('Discordbot');
}

export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true; // No UA at all is almost always a scraper.
  const ua = userAgent.toLowerCase();
  return BOT_PATTERNS.some((pattern) => ua.includes(pattern));
}
