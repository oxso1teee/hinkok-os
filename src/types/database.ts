export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      entities: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          kind: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          kind?: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          kind?: string;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      raw_captures: {
        Row: {
          id: string;
          user_id: string;
          source: string;
          raw_text: string;
          audio_url: string | null;
          classification: Json;
          llm_source: string | null;
          routed_to: string | null;
          routed_id: string | null;
          idempotency_key: string | null;
          processing_status: string;
          processing_error: string | null;
          processed_at: string | null;
          media_type: string;
          media_file_id: string | null;
          external_ref: string | null;
          source_reply_sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source?: string;
          raw_text: string;
          audio_url?: string | null;
          classification?: Json;
          llm_source?: string | null;
          routed_to?: string | null;
          routed_id?: string | null;
          idempotency_key?: string | null;
          processing_status?: string;
          processing_error?: string | null;
          processed_at?: string | null;
          media_type?: string;
          media_file_id?: string | null;
          external_ref?: string | null;
          source_reply_sent_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source?: string;
          raw_text?: string;
          audio_url?: string | null;
          classification?: Json;
          llm_source?: string | null;
          routed_to?: string | null;
          routed_id?: string | null;
          idempotency_key?: string | null;
          processing_status?: string;
          processing_error?: string | null;
          processed_at?: string | null;
          media_type?: string;
          media_file_id?: string | null;
          external_ref?: string | null;
          source_reply_sent_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          urgency: string;
          category: string;
          sphere: string | null;
          key: boolean;
          priority_score: number;
          time_estimate_min: number | null;
          tags: string[];
          due_date: string | null;
          owner: string | null;
          entity_id: string | null;
          completed_at: string | null;
          board_position: number;
          client_request_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          urgency?: string;
          category?: string;
          sphere?: string | null;
          key?: boolean;
          priority_score?: number;
          time_estimate_min?: number | null;
          tags?: string[];
          due_date?: string | null;
          owner?: string | null;
          entity_id?: string | null;
          completed_at?: string | null;
          board_position?: number;
          client_request_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          urgency?: string;
          category?: string;
          sphere?: string | null;
          key?: boolean;
          priority_score?: number;
          time_estimate_min?: number | null;
          tags?: string[];
          due_date?: string | null;
          owner?: string | null;
          entity_id?: string | null;
          completed_at?: string | null;
          board_position?: number;
          client_request_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_entity_id_fkey";
            columns: ["entity_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_logs: {
        Row: {
          id: string;
          user_id: string;
          log_date: string;
          notes: Json;
          mood: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          log_date: string;
          notes?: Json;
          mood?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          log_date?: string;
          notes?: Json;
          mood?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      google_oauth_connections: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          encrypted_access_token: string | null;
          encrypted_refresh_token: string | null;
          token_expiry: string | null;
          scopes: string[];
          calendar_sync_token: string | null;
          connected_email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider?: string;
          encrypted_access_token?: string | null;
          encrypted_refresh_token?: string | null;
          token_expiry?: string | null;
          scopes?: string[];
          calendar_sync_token?: string | null;
          connected_email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: string;
          encrypted_access_token?: string | null;
          encrypted_refresh_token?: string | null;
          token_expiry?: string | null;
          scopes?: string[];
          calendar_sync_token?: string | null;
          connected_email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      google_oauth_states: {
        Row: {
          id: string;
          user_id: string;
          state_hash: string;
          encrypted_code_verifier: string;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          state_hash: string;
          encrypted_code_verifier: string;
          expires_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          state_hash?: string;
          encrypted_code_verifier?: string;
          expires_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      google_calendar_events: {
        Row: {
          id: string;
          user_id: string;
          google_event_id: string;
          calendar_id: string;
          title: string;
          description: string | null;
          location: string | null;
          start_at: string | null;
          end_at: string | null;
          start_date: string | null;
          end_date: string | null;
          all_day: boolean;
          status: string;
          html_link: string | null;
          etag: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          google_event_id: string;
          calendar_id: string;
          title: string;
          description?: string | null;
          location?: string | null;
          start_at?: string | null;
          end_at?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          all_day?: boolean;
          status?: string;
          html_link?: string | null;
          etag?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          google_event_id?: string;
          calendar_id?: string;
          title?: string;
          description?: string | null;
          location?: string | null;
          start_at?: string | null;
          end_at?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          all_day?: boolean;
          status?: string;
          html_link?: string | null;
          etag?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      finance_transactions: {
        Row: {
          id: string;
          user_id: string;
          source: string;
          external_key: string;
          transaction_date: string;
          amount: number;
          currency: string;
          category: string | null;
          description: string | null;
          account: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source?: string;
          external_key: string;
          transaction_date: string;
          amount: number;
          currency: string;
          category?: string | null;
          description?: string | null;
          account?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source?: string;
          external_key?: string;
          transaction_date?: string;
          amount?: number;
          currency?: string;
          category?: string | null;
          description?: string | null;
          account?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      weekly_insights: {
        Row: {
          id: string;
          user_id: string;
          week_start: string;
          week_end: string;
          summary: string;
          highlights: Json;
          patterns: Json;
          recommendations: Json;
          metrics: Json;
          provider: string;
          generated_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          week_start: string;
          week_end: string;
          summary: string;
          highlights?: Json;
          patterns?: Json;
          recommendations?: Json;
          metrics?: Json;
          provider: string;
          generated_at: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          week_start?: string;
          week_end?: string;
          summary?: string;
          highlights?: Json;
          patterns?: Json;
          recommendations?: Json;
          metrics?: Json;
          provider?: string;
          generated_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      memory_chunks: {
        Row: {
          id: string;
          user_id: string;
          source_type: string;
          source_id: string | null;
          source_key: string;
          chunk_index: number;
          text: string;
          embedding: string | null;
          content_hash: string;
          embedding_model: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_type: string;
          source_id?: string | null;
          source_key: string;
          chunk_index?: number;
          text: string;
          embedding?: string | null;
          content_hash: string;
          embedding_model?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source_type?: string;
          source_id?: string | null;
          source_key?: string;
          chunk_index?: number;
          text?: string;
          embedding?: string | null;
          content_hash?: string;
          embedding_model?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          user_id: string;
          action: string;
          resource_type: string | null;
          resource_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          action: string;
          resource_type?: string | null;
          resource_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          action?: string;
          resource_type?: string | null;
          resource_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      login_attempts: {
        Row: {
          id: string;
          ip: string | null;
          ok: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          ip?: string | null;
          ok: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          ip?: string | null;
          ok?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      rate_limit: {
        Row: {
          id: number;
          bucket: string;
          created_at: string;
        };
        Insert: {
          id?: never;
          bucket: string;
          created_at?: string;
        };
        Update: {
          id?: never;
          bucket?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      telegram_updates: {
        Row: {
          update_id: number;
          status: string;
          attempts: number;
          locked_until: string;
          completed_at: string | null;
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          update_id: number;
          status?: string;
          attempts?: number;
          locked_until: string;
          completed_at?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          update_id?: number;
          status?: string;
          attempts?: number;
          locked_until?: string;
          completed_at?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      kv_cache: {
        Row: {
          key: string;
          value: Json;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Json;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      system_job_runs: {
        Row: {
          id: string;
          user_id: string;
          job_name: string;
          trigger_source: string;
          status: string;
          started_at: string;
          heartbeat_at: string;
          finished_at: string | null;
          duration_ms: number | null;
          summary: Json;
          error_code: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          job_name: string;
          trigger_source: string;
          status?: string;
          started_at?: string;
          heartbeat_at?: string;
          finished_at?: string | null;
          duration_ms?: number | null;
          summary?: Json;
          error_code?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          job_name?: string;
          trigger_source?: string;
          status?: string;
          started_at?: string;
          heartbeat_at?: string;
          finished_at?: string | null;
          duration_ms?: number | null;
          summary?: Json;
          error_code?: string | null;
        };
        Relationships: [];
      };
      personal_settings: {
        Row: {
          user_id: string;
          display_name: string;
          focus_statement: string;
          habits: Json;
          nutrition_targets: Json;
          sphere_info: Json;
          obsidian_folder_mapping: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          display_name: string;
          focus_statement: string;
          habits: Json;
          nutrition_targets: Json;
          sphere_info: Json;
          obsidian_folder_mapping: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          display_name?: string;
          focus_statement?: string;
          habits?: Json;
          nutrition_targets?: Json;
          sphere_info?: Json;
          obsidian_folder_mapping?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      auth_password_override: {
        Row: {
          user_id: string;
          password_hash: string;
          password_salt: string;
          password_scrypt_cost: number;
          recovered_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          password_hash: string;
          password_salt: string;
          password_scrypt_cost: number;
          recovered_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          password_hash?: string;
          password_salt?: string;
          password_scrypt_cost?: number;
          recovered_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      consume_google_oauth_state: {
        Args: {
          p_user_id: string;
          p_state_hash: string;
        };
        Returns: string | null;
      };
      upsert_weekly_insight: {
        Args: {
          p_user_id: string;
          p_week_start: string;
          p_week_end: string;
          p_summary: string;
          p_highlights: Json;
          p_patterns: Json;
          p_recommendations: Json;
          p_metrics: Json;
          p_provider: string;
          p_generated_at: string;
        };
        Returns: string;
      };
      set_journal_mood: {
        Args: {
          p_user_id: string;
          p_log_date: string;
          p_mood: string;
        };
        Returns: string;
      };
      save_journal_daily_entry: {
        Args: {
          p_user_id: string;
          p_log_date: string;
          p_local_time: string;
          p_text: string;
        };
        Returns: string;
      };
      brain_sphere_stats: {
        Args: {
          p_user_id: string;
        };
        Returns: {
          sphere: string;
          open_task_count: number;
          note_count: number;
          obsidian_note_count: number;
        }[];
      };
      create_crm_task: {
        Args: {
          p_user_id: string;
          p_client_request_id: string;
          p_title: string;
          p_description: string | null;
          p_urgency: string;
          p_category: string;
          p_sphere: string | null;
          p_key: boolean;
          p_priority_score: number;
          p_time_estimate_min: number | null;
          p_tags: string[];
          p_entity_id: string | null;
        };
        Returns: string;
      };
      update_crm_task: {
        Args: {
          p_user_id: string;
          p_task_id: string;
          p_title: string;
          p_description: string | null;
          p_urgency: string;
          p_category: string;
          p_sphere: string | null;
          p_key: boolean;
          p_priority_score: number;
          p_time_estimate_min: number | null;
          p_tags: string[];
          p_entity_id: string | null;
        };
        Returns: boolean;
      };
      move_crm_task: {
        Args: {
          p_user_id: string;
          p_task_id: string;
          p_urgency: string;
          p_before_task_id?: string | null;
        };
        Returns: boolean;
      };
      set_task_completion: {
        Args: {
          p_user_id: string;
          p_task_id: string;
          p_completed: boolean;
        };
        Returns: boolean;
      };
      set_daily_habit: {
        Args: {
          p_user_id: string;
          p_log_date: string;
          p_habit_id: string;
          p_value: number;
        };
        Returns: string;
      };
      add_daily_goal: {
        Args: {
          p_user_id: string;
          p_log_date: string;
          p_period: string;
          p_text: string;
        };
        Returns: Json;
      };
      set_daily_goal_completed: {
        Args: {
          p_user_id: string;
          p_log_date: string;
          p_period: string;
          p_goal_id: string;
          p_done: boolean;
        };
        Returns: boolean;
      };
      upsert_daily_activity: {
        Args: {
          p_user_id: string;
          p_log_date: string;
          p_activity: Json;
        };
        Returns: string;
      };
      sync_finance_transactions: {
        Args: {
          p_user_id: string;
          p_transactions: Json;
        };
        Returns: {
          upserted_count: number;
          deleted_count: number;
        }[];
      };
      match_memory_chunks: {
        Args: {
          query_embedding: string;
          match_count?: number;
          filter_user_id?: string | null;
        };
        Returns: {
          id: string;
          user_id: string;
          source_type: string;
          source_id: string | null;
          source_key: string;
          chunk_index: number;
          text: string;
          metadata: Json;
          created_at: string;
          similarity: number;
        }[];
      };
      consume_rate_limit: {
        Args: {
          p_bucket: string;
          p_window_seconds: number;
          p_max_requests: number;
        };
        Returns: boolean;
      };
      route_capture: {
        Args: {
          p_user_id: string;
          p_source: string;
          p_raw_text: string;
          p_classification: Json;
          p_llm_source: string;
          p_idempotency_key: string;
          p_local_date: string;
          p_local_time: string;
        };
        Returns: {
          capture_id: string;
          capture_classification: Json;
          classifier_source: string;
          route_name: string;
          route_id: string | null;
          was_created: boolean;
          processing_status: string;
        }[];
      };
      attach_capture_media: {
        Args: {
          p_user_id: string;
          p_capture_id: string;
          p_media_type: string;
          p_media_file_id: string;
        };
        Returns: boolean;
      };
      claim_telegram_update: {
        Args: {
          p_update_id: number;
          p_lease_seconds?: number;
        };
        Returns: number;
      };
      complete_telegram_update: {
        Args: {
          p_update_id: number;
          p_attempt: number;
          p_ok: boolean;
        };
        Returns: boolean;
      };
      mark_capture_reply_sent: {
        Args: {
          p_user_id: string;
          p_capture_id: string;
        };
        Returns: boolean;
      };
      apply_meal_nutrition: {
        Args: {
          p_user_id: string;
          p_capture_id: string;
          p_kcal: number;
          p_protein: number;
          p_carbs: number;
          p_fat: number;
        };
        Returns: boolean;
      };
      complete_calendar_route: {
        Args: {
          p_user_id: string;
          p_capture_id: string;
          p_external_ref: string;
        };
        Returns: boolean;
      };
      set_task_urgency: {
        Args: {
          p_user_id: string;
          p_task_id: string;
          p_urgency: string;
        };
        Returns: boolean;
      };
      register_login_attempt: {
        Args: {
          p_ip: string;
          p_ok: boolean;
          p_window_seconds?: number;
          p_max_failures?: number;
        };
        Returns: boolean;
      };
      count_recent_login_failures: {
        Args: {
          p_window_seconds?: number;
        };
        Returns: number;
      };
      begin_system_job: {
        Args: {
          p_user_id: string;
          p_job_name: string;
          p_trigger_source: string;
          p_stale_after_seconds?: number;
          p_min_interval_seconds?: number;
        };
        Returns: string | null;
      };
      finish_system_job: {
        Args: {
          p_user_id: string;
          p_run_id: string;
          p_status: string;
          p_summary?: Json;
          p_error_code?: string | null;
        };
        Returns: boolean;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
