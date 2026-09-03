/** Which dcinside board family a URL belongs to. Decides the path prefix. */
export type BoardKind = 'gall' | 'mgallery' | 'mini' | 'person';

/** A post ("글") on some gallery. */
export interface PostTarget {
  kind: 'post';
  board: BoardKind;
  /** Gallery id, e.g. `sff`. */
  id: string;
  /** Post number, e.g. `1719767`. */
  no: string;
  /** Query params worth carrying over to dcinside (page, exception_mode, ...). */
  extra: Record<string, string>;
}

/** A gallery listing page ("갤러리"). */
export interface ListTarget {
  kind: 'list';
  board: BoardKind;
  id: string;
  extra: Record<string, string>;
}

export type Target = PostTarget | ListTarget;

export type MediaKind = 'image' | 'video' | 'dccon' | 'embed';

export interface Media {
  kind: MediaKind;
  /** Original dcinside URL. Needs a Referer header to fetch. */
  url: string;
  /** Poster frame for videos, when dcinside gives us one. */
  thumbnail?: string;
  width?: number;
  height?: number;
  /** `alt` on images; dcinside stores its own file hash there. */
  alt?: string;
}

export interface Author {
  nick: string;
  /** Set for logged-in (고정닉) writers. */
  uid?: string;
  /** Set for anonymous (유동) writers, e.g. `211.246`. */
  ip?: string;
  /** True when the writer has an account rather than an IP. */
  fixed: boolean;
}

export interface Post {
  board: BoardKind;
  galleryId: string;
  galleryName: string;
  no: string;
  title: string;
  /** 말머리, e.g. `[일반]`. */
  headText?: string;
  author: Author;
  /** ISO-8601 in KST (dcinside publishes wall-clock Seoul time). */
  createdAt?: string;
  views: number;
  upvotes: number;
  downvotes: number;
  commentCount: number;
  /** Post body flattened to plain text. */
  text: string;
  media: Media[];
  /** Canonical dcinside URL. */
  url: string;
}

export interface ListEntry {
  no: string;
  title: string;
  url: string;
  author: Author;
  /** dcinside's row icon: `icon_pic`, `icon_txt`, `icon_recomimg`, `icon_notice`, ... */
  type?: string;
  notice: boolean;
  views: number;
  upvotes: number;
  commentCount: number;
  createdAt?: string;
}

export interface GalleryList {
  board: BoardKind;
  galleryId: string;
  galleryName: string;
  posts: ListEntry[];
  url: string;
}
