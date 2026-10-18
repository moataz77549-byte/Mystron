export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17";
  };
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
        };
        Relationships: [];
      };
      authors: {
        Row: {
          avatar_asset_id: string | null;
          bio: string | null;
          city: string | null;
          country: string | null;
          created_at: string;
          deleted_at: string | null;
          display_name: string;
          id: string;
          is_active: boolean;
          links: Json;
          profile_id: string | null;
          short_name: string | null;
          slug: string;
          sort_order: number;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          avatar_asset_id?: string | null;
          bio?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          display_name: string;
          id?: string;
          is_active?: boolean;
          links?: Json;
          profile_id?: string | null;
          short_name?: string | null;
          slug: string;
          sort_order?: number;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          avatar_asset_id?: string | null;
          bio?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          display_name?: string;
          id?: string;
          is_active?: boolean;
          links?: Json;
          profile_id?: string | null;
          short_name?: string | null;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "authors_avatar_asset_fk";
            columns: ["avatar_asset_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "authors_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          icon: string | null;
          id: string;
          image_asset_id: string | null;
          is_active: boolean;
          name: string;
          parent_id: string | null;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          image_asset_id?: string | null;
          is_active?: boolean;
          name: string;
          parent_id?: string | null;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          image_asset_id?: string | null;
          is_active?: boolean;
          name?: string;
          parent_id?: string | null;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_image_asset_fk";
            columns: ["image_asset_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      comment_reports: {
        Row: {
          comment_id: string;
          created_at: string;
          id: string;
          reason: string;
          visitor_hash: string;
        };
        Insert: {
          comment_id: string;
          created_at?: string;
          id?: string;
          reason: string;
          visitor_hash: string;
        };
        Update: {
          comment_id?: string;
          created_at?: string;
          id?: string;
          reason?: string;
          visitor_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comment_reports_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: {
          body: string;
          created_at: string;
          deleted_at: string | null;
          depth: number;
          guest_name: string | null;
          id: string;
          parent_id: string | null;
          post_id: string;
          status: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          body: string;
          created_at?: string;
          deleted_at?: string | null;
          depth?: number;
          guest_name?: string | null;
          id?: string;
          parent_id?: string | null;
          post_id: string;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          body?: string;
          created_at?: string;
          deleted_at?: string | null;
          depth?: number;
          guest_name?: string | null;
          id?: string;
          parent_id?: string | null;
          post_id?: string;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      media_assets: {
        Row: {
          alt_text: string | null;
          animated: boolean;
          caption: string | null;
          checksum: string | null;
          created_at: string;
          deleted_at: string | null;
          display_name: string;
          folder: string;
          height: number | null;
          id: string;
          mime_type: string;
          owner_id: string | null;
          path: string;
          size_bytes: number;
          updated_at: string;
          variants: Json;
          visibility: string;
          width: number | null;
        };
        Insert: {
          alt_text?: string | null;
          animated?: boolean;
          caption?: string | null;
          checksum?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          display_name?: string;
          folder?: string;
          height?: number | null;
          id?: string;
          mime_type: string;
          owner_id?: string | null;
          path: string;
          size_bytes: number;
          updated_at?: string;
          variants?: Json;
          visibility?: string;
          width?: number | null;
        };
        Update: {
          alt_text?: string | null;
          animated?: boolean;
          caption?: string | null;
          checksum?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          display_name?: string;
          folder?: string;
          height?: number | null;
          id?: string;
          mime_type?: string;
          owner_id?: string | null;
          path?: string;
          size_bytes?: number;
          updated_at?: string;
          variants?: Json;
          visibility?: string;
          width?: number | null;
        };
        Relationships: [];
      };
      post_categories: {
        Row: {
          category_id: string;
          post_id: string;
        };
        Insert: {
          category_id: string;
          post_id: string;
        };
        Update: {
          category_id?: string;
          post_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_categories_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_categories_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      post_media: {
        Row: {
          asset_id: string;
          post_id: string;
        };
        Insert: {
          asset_id: string;
          post_id: string;
        };
        Update: {
          asset_id?: string;
          post_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_media_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_media_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      post_revisions: {
        Row: {
          created_at: string;
          editor_id: string | null;
          id: string;
          post_id: string;
          snapshot: Json;
        };
        Insert: {
          created_at?: string;
          editor_id?: string | null;
          id?: string;
          post_id: string;
          snapshot: Json;
        };
        Update: {
          created_at?: string;
          editor_id?: string | null;
          id?: string;
          post_id?: string;
          snapshot?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "post_revisions_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      post_view_daily: {
        Row: {
          day: string;
          post_id: string;
          views: number;
        };
        Insert: {
          day: string;
          post_id: string;
          views?: number;
        };
        Update: {
          day?: string;
          post_id?: string;
          views?: number;
        };
        Relationships: [
          {
            foreignKeyName: "post_view_daily_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      post_views: {
        Row: {
          created_at: string;
          id: string;
          post_id: string;
          viewed_on: string;
          visitor_hash: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          post_id: string;
          viewed_on?: string;
          visitor_hash: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          post_id?: string;
          viewed_on?: string;
          visitor_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_views_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      posts: {
        Row: {
          allow_comments: boolean;
          author_id: string | null;
          canonical_url: string | null;
          comments_close_at: string | null;
          content: string;
          content_html: string;
          content_json: Json;
          cover_asset_id: string | null;
          cover_image: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          editorial_keywords: string[];
          excerpt: string | null;
          featured: boolean;
          id: string;
          last_schedule_error: string | null;
          next_schedule_attempt_at: string | null;
          primary_category_id: string | null;
          published_at: string | null;
          reading_minutes: number;
          schedule_attempts: number;
          scheduled_at: string | null;
          scheduled_by: string | null;
          search_vector: unknown;
          seo_description: string | null;
          seo_title: string | null;
          share_asset_id: string | null;
          sharing: Json;
          slug: string;
          sources: Json;
          status: string;
          subtitle: string | null;
          tags: string[];
          thumbnail_asset_id: string | null;
          title: string;
          updated_at: string;
          version: number;
          visibility: string;
        };
        Insert: {
          allow_comments?: boolean;
          author_id?: string | null;
          canonical_url?: string | null;
          comments_close_at?: string | null;
          content?: string;
          content_html?: string;
          content_json?: Json;
          cover_asset_id?: string | null;
          cover_image?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          editorial_keywords?: string[];
          excerpt?: string | null;
          featured?: boolean;
          id?: string;
          last_schedule_error?: string | null;
          next_schedule_attempt_at?: string | null;
          primary_category_id?: string | null;
          published_at?: string | null;
          reading_minutes?: number;
          schedule_attempts?: number;
          scheduled_at?: string | null;
          scheduled_by?: string | null;
          search_vector?: unknown;
          seo_description?: string | null;
          seo_title?: string | null;
          share_asset_id?: string | null;
          sharing?: Json;
          slug: string;
          sources?: Json;
          status?: string;
          subtitle?: string | null;
          tags?: string[];
          thumbnail_asset_id?: string | null;
          title: string;
          updated_at?: string;
          version?: number;
          visibility?: string;
        };
        Update: {
          allow_comments?: boolean;
          author_id?: string | null;
          canonical_url?: string | null;
          comments_close_at?: string | null;
          content?: string;
          content_html?: string;
          content_json?: Json;
          cover_asset_id?: string | null;
          cover_image?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          editorial_keywords?: string[];
          excerpt?: string | null;
          featured?: boolean;
          id?: string;
          last_schedule_error?: string | null;
          next_schedule_attempt_at?: string | null;
          primary_category_id?: string | null;
          published_at?: string | null;
          reading_minutes?: number;
          schedule_attempts?: number;
          scheduled_at?: string | null;
          scheduled_by?: string | null;
          search_vector?: unknown;
          seo_description?: string | null;
          seo_title?: string | null;
          share_asset_id?: string | null;
          sharing?: Json;
          slug?: string;
          sources?: Json;
          status?: string;
          subtitle?: string | null;
          tags?: string[];
          thumbnail_asset_id?: string | null;
          title?: string;
          updated_at?: string;
          version?: number;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "authors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "posts_cover_asset_fk";
            columns: ["cover_asset_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "posts_primary_category_id_fkey";
            columns: ["primary_category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "posts_share_asset_fk";
            columns: ["share_asset_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "posts_thumbnail_asset_fk";
            columns: ["thumbnail_asset_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      publishing_runs: {
        Row: {
          created_at: string;
          id: string;
          post_id: string | null;
          reason: string | null;
          status: string;
          trigger: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          post_id?: string | null;
          reason?: string | null;
          status: string;
          trigger: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          post_id?: string | null;
          reason?: string | null;
          status?: string;
          trigger?: string;
        };
        Relationships: [
          {
            foreignKeyName: "publishing_runs_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      roles: {
        Row: {
          id: string;
          name: string;
        };
        Insert: {
          id?: string;
          name: string;
        };
        Update: {
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      site_settings: {
        Row: {
          is_public: boolean;
          key: string;
          updated_at: string;
          value: Json;
        };
        Insert: {
          is_public?: boolean;
          key: string;
          updated_at?: string;
          value: Json;
        };
        Update: {
          is_public?: boolean;
          key?: string;
          updated_at?: string;
          value?: Json;
        };
        Relationships: [];
      };
      slug_redirects: {
        Row: {
          created_at: string;
          kind: string;
          new_slug: string;
          old_slug: string;
        };
        Insert: {
          created_at?: string;
          kind: string;
          new_slug: string;
          old_slug: string;
        };
        Update: {
          created_at?: string;
          kind?: string;
          new_slug?: string;
          old_slug?: string;
        };
        Relationships: [];
      };
      ticker_items: {
        Row: {
          created_at: string;
          ends_at: string | null;
          id: string;
          image_asset_id: string | null;
          is_active: boolean;
          pages: string[];
          placement: string;
          sort_order: number;
          sponsored: boolean;
          starts_at: string;
          style: string;
          text: string;
          updated_at: string;
          url: string | null;
        };
        Insert: {
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          image_asset_id?: string | null;
          is_active?: boolean;
          pages?: string[];
          placement?: string;
          sort_order?: number;
          sponsored?: boolean;
          starts_at?: string;
          style?: string;
          text: string;
          updated_at?: string;
          url?: string | null;
        };
        Update: {
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          image_asset_id?: string | null;
          is_active?: boolean;
          pages?: string[];
          placement?: string;
          sort_order?: number;
          sponsored?: boolean;
          starts_at?: string;
          style?: string;
          text?: string;
          updated_at?: string;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ticker_items_image_asset_id_fkey";
            columns: ["image_asset_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          role_id: string;
          user_id: string;
        };
        Insert: {
          role_id: string;
          user_id: string;
        };
        Update: {
          role_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      cms_bulk_transition: {
        Args: { p_action: string; p_items: Json };
        Returns: Json;
      };
      cms_moderate_comment: {
        Args: { p_action: string; p_id: string };
        Returns: undefined;
      };
      cms_move_category_posts: {
        Args: { p_from: string; p_to: string };
        Returns: number;
      };
      cms_publishing_settings: { Args: { p_value: Json }; Returns: undefined };
      cms_register_media: {
        Args: { p_asset: Json };
        Returns: {
          alt_text: string | null;
          animated: boolean;
          caption: string | null;
          checksum: string | null;
          created_at: string;
          deleted_at: string | null;
          display_name: string;
          folder: string;
          height: number | null;
          id: string;
          mime_type: string;
          owner_id: string | null;
          path: string;
          size_bytes: number;
          updated_at: string;
          variants: Json;
          visibility: string;
          width: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "media_assets";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      cms_restore_revision: {
        Args: { p_expected_version: number; p_revision_id: string };
        Returns: {
          allow_comments: boolean;
          author_id: string | null;
          canonical_url: string | null;
          comments_close_at: string | null;
          content: string;
          content_html: string;
          content_json: Json;
          cover_asset_id: string | null;
          cover_image: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          editorial_keywords: string[];
          excerpt: string | null;
          featured: boolean;
          id: string;
          last_schedule_error: string | null;
          next_schedule_attempt_at: string | null;
          primary_category_id: string | null;
          published_at: string | null;
          reading_minutes: number;
          schedule_attempts: number;
          scheduled_at: string | null;
          scheduled_by: string | null;
          search_vector: unknown;
          seo_description: string | null;
          seo_title: string | null;
          share_asset_id: string | null;
          sharing: Json;
          slug: string;
          sources: Json;
          status: string;
          subtitle: string | null;
          tags: string[];
          thumbnail_asset_id: string | null;
          title: string;
          updated_at: string;
          version: number;
          visibility: string;
        };
        SetofOptions: {
          from: "*";
          to: "posts";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      cms_save_author: {
        Args: { p_id: string; p_patch: Json };
        Returns: {
          avatar_asset_id: string | null;
          bio: string | null;
          city: string | null;
          country: string | null;
          created_at: string;
          deleted_at: string | null;
          display_name: string;
          id: string;
          is_active: boolean;
          links: Json;
          profile_id: string | null;
          short_name: string | null;
          slug: string;
          sort_order: number;
          updated_at: string;
          website: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "authors";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      cms_save_category: {
        Args: { p_id: string; p_patch: Json; p_transfer_to?: string };
        Returns: {
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          icon: string | null;
          id: string;
          image_asset_id: string | null;
          is_active: boolean;
          name: string;
          parent_id: string | null;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "categories";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      cms_save_post: {
        Args: { p_expected_version?: number; p_id: string; p_patch: Json };
        Returns: {
          allow_comments: boolean;
          author_id: string | null;
          canonical_url: string | null;
          comments_close_at: string | null;
          content: string;
          content_html: string;
          content_json: Json;
          cover_asset_id: string | null;
          cover_image: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          editorial_keywords: string[];
          excerpt: string | null;
          featured: boolean;
          id: string;
          last_schedule_error: string | null;
          next_schedule_attempt_at: string | null;
          primary_category_id: string | null;
          published_at: string | null;
          reading_minutes: number;
          schedule_attempts: number;
          scheduled_at: string | null;
          scheduled_by: string | null;
          search_vector: unknown;
          seo_description: string | null;
          seo_title: string | null;
          share_asset_id: string | null;
          sharing: Json;
          slug: string;
          sources: Json;
          status: string;
          subtitle: string | null;
          tags: string[];
          thumbnail_asset_id: string | null;
          title: string;
          updated_at: string;
          version: number;
          visibility: string;
        };
        SetofOptions: {
          from: "*";
          to: "posts";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      cms_save_ticker: {
        Args: { p_id: string; p_patch: Json };
        Returns: {
          created_at: string;
          ends_at: string | null;
          id: string;
          image_asset_id: string | null;
          is_active: boolean;
          pages: string[];
          placement: string;
          sort_order: number;
          sponsored: boolean;
          starts_at: string;
          style: string;
          text: string;
          updated_at: string;
          url: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "ticker_items";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      cms_transition_post: {
        Args: {
          p_action: string;
          p_expected_version: number;
          p_id: string;
          p_scheduled_at?: string;
        };
        Returns: {
          allow_comments: boolean;
          author_id: string | null;
          canonical_url: string | null;
          comments_close_at: string | null;
          content: string;
          content_html: string;
          content_json: Json;
          cover_asset_id: string | null;
          cover_image: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          editorial_keywords: string[];
          excerpt: string | null;
          featured: boolean;
          id: string;
          last_schedule_error: string | null;
          next_schedule_attempt_at: string | null;
          primary_category_id: string | null;
          published_at: string | null;
          reading_minutes: number;
          schedule_attempts: number;
          scheduled_at: string | null;
          scheduled_by: string | null;
          search_vector: unknown;
          seo_description: string | null;
          seo_title: string | null;
          share_asset_id: string | null;
          sharing: Json;
          slug: string;
          sources: Json;
          status: string;
          subtitle: string | null;
          tags: string[];
          thumbnail_asset_id: string | null;
          title: string;
          updated_at: string;
          version: number;
          visibility: string;
        };
        SetofOptions: {
          from: "*";
          to: "posts";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      cms_update_media: {
        Args: { p_id: string; p_patch: Json };
        Returns: {
          alt_text: string | null;
          animated: boolean;
          caption: string | null;
          checksum: string | null;
          created_at: string;
          deleted_at: string | null;
          display_name: string;
          folder: string;
          height: number | null;
          id: string;
          mime_type: string;
          owner_id: string | null;
          path: string;
          size_bytes: number;
          updated_at: string;
          variants: Json;
          visibility: string;
          width: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "media_assets";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      consume_rate_limit: {
        Args: { p_key: string; p_limit: number; p_seconds: number };
        Returns: boolean;
      };
      normalize_arabic: { Args: { value: string }; Returns: string };
      post_view_count: { Args: { p_post_id: string }; Returns: number };
      public_view_stats: {
        Args: { p_days?: number; p_limit?: number };
        Returns: {
          period_views: number;
          post_id: string;
          total_views: number;
        }[];
      };
      record_post_view: {
        Args: { p_post_id: string; p_visitor_hash: string };
        Returns: boolean;
      };
      report_comment: {
        Args: {
          p_comment_id: string;
          p_reason: string;
          p_visitor_hash: string;
        };
        Returns: undefined;
      };
      run_due_posts: { Args: never; Returns: number };
      set_account_pin: {
        Args: { p_hash: string; p_user_id: string };
        Returns: undefined;
      };
      submit_guest_comment: {
        Args: {
          p_body: string;
          p_email: string;
          p_name: string;
          p_parent_id: string;
          p_post_id: string;
        };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
