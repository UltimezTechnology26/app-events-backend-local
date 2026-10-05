// modules/community-posts/community-posts.types.ts

export interface CreatePostBody {
  content: string
  group_id: number | string
  image?: string
}

export interface CreateRepostBody {
  post_id: number | string
  repost_comment?: string
}

export interface SaveLikeBody {
  post_id: number | string
  like_status: number | string
}

export interface RewritePostBody {
  content: string
}

export interface AddCommentBody {
  post_id: number | string
  comment: string
  parent_comment_id?: number | string | null
}
