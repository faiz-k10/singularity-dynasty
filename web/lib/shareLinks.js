// The "compose a post" address of each social platform, used by the site-wide Share pop-up (app/ShareDialog.js) for Lab charts and every
// share card: the post's text and link filled in, the link's preview showing the picture. Discord, Instagram and TikTok have none.
// Pure; tested in test/labShare.test.mjs.
export function composeUrl(platform, { url, text }) {
  const e = encodeURIComponent;
  switch (platform) {
    case "x":
      return `https://twitter.com/intent/tweet?text=${e(text)}&url=${e(url)}`;
    case "threads":
      return `https://www.threads.net/intent/post?text=${e(`${text} ${url}`)}`;
    case "bluesky":
      return `https://bsky.app/intent/compose?text=${e(`${text} ${url}`)}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`;
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${e(url)}`;
    case "reddit":
      return `https://www.reddit.com/submit?url=${e(url)}&title=${e(text)}`;
    default:
      return null;
  }
}
