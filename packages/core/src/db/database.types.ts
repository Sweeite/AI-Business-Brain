export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agent_config_versions: {
        Row: {
          agent_config_id: string
          change_reason: string | null
          changed_by: string | null
          created_at: string
          id: string
          improvement_suggestion_id: string | null
          model: string
          system_prompt: string
          tool_ids: Json
          version: number
        }
        Insert: {
          agent_config_id: string
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string
          id?: string
          improvement_suggestion_id?: string | null
          model: string
          system_prompt: string
          tool_ids?: Json
          version: number
        }
        Update: {
          agent_config_id?: string
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string
          id?: string
          improvement_suggestion_id?: string | null
          model?: string
          system_prompt?: string
          tool_ids?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_config_versions_agent_config_id_fkey"
            columns: ["agent_config_id"]
            isOneToOne: false
            referencedRelation: "agent_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_config_versions_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_configs: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          model: string
          name: string
          required_role: string | null
          system_prompt: string
          tool_ids: Json
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          model?: string
          name: string
          required_role?: string | null
          system_prompt: string
          tool_ids?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          model?: string
          name?: string
          required_role?: string | null
          system_prompt?: string
          tool_ids?: Json
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      agent_runs: {
        Row: {
          acting_user_id: string | null
          agent_config_id: string | null
          cost_usd: number | null
          created_at: string
          duration_ms: number | null
          id: string
          job_run_id: string | null
          memory_retrieved: Json | null
          output: string | null
          provenance_labels: Json | null
          reasoning_trace: string | null
          status: string
          tokens_used: number | null
          tool_calls: Json | null
          trigger_context: Json | null
          user_feedback: string | null
          user_rating: number | null
        }
        Insert: {
          acting_user_id?: string | null
          agent_config_id?: string | null
          cost_usd?: number | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          job_run_id?: string | null
          memory_retrieved?: Json | null
          output?: string | null
          provenance_labels?: Json | null
          reasoning_trace?: string | null
          status?: string
          tokens_used?: number | null
          tool_calls?: Json | null
          trigger_context?: Json | null
          user_feedback?: string | null
          user_rating?: number | null
        }
        Update: {
          acting_user_id?: string | null
          agent_config_id?: string | null
          cost_usd?: number | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          job_run_id?: string | null
          memory_retrieved?: Json | null
          output?: string | null
          provenance_labels?: Json | null
          reasoning_trace?: string | null
          status?: string
          tokens_used?: number | null
          tool_calls?: Json | null
          trigger_context?: Json | null
          user_feedback?: string | null
          user_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_acting_user_id_fkey"
            columns: ["acting_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_agent_config_id_fkey"
            columns: ["agent_config_id"]
            isOneToOne: false
            referencedRelation: "agent_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_job_run_id_fkey"
            columns: ["job_run_id"]
            isOneToOne: false
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action_type: string
          actor_id: string
          actor_type: string
          created_at: string
          id: string
          ip_address: unknown
          metadata: Json | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action_type: string
          actor_id: string
          actor_type: string
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action_type?: string
          actor_id?: string
          actor_type?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      chunks: {
        Row: {
          connector_type: string
          content: string
          created_at: string
          embedding: string | null
          embedding_model: string | null
          id: string
          owner_user_id: string | null
          search_vector: unknown
          source_ref: Json
        }
        Insert: {
          connector_type: string
          content: string
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          id?: string
          owner_user_id?: string | null
          search_vector?: unknown
          source_ref: Json
        }
        Update: {
          connector_type?: string
          content?: string
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          id?: string
          owner_user_id?: string | null
          search_vector?: unknown
          source_ref?: Json
        }
        Relationships: [
          {
            foreignKeyName: "chunks_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          connector_type: string
          created_at: string
          created_by: string
          credential_ref: string
          exclusion_rules: Json | null
          granted_scopes: Json
          id: string
          last_synced_at: string | null
          owner_user_id: string | null
          scope: string
          status: string
          sync_cursor: Json | null
          webhook_expires_at: string | null
        }
        Insert: {
          connector_type: string
          created_at?: string
          created_by: string
          credential_ref: string
          exclusion_rules?: Json | null
          granted_scopes?: Json
          id?: string
          last_synced_at?: string | null
          owner_user_id?: string | null
          scope: string
          status?: string
          sync_cursor?: Json | null
          webhook_expires_at?: string | null
        }
        Update: {
          connector_type?: string
          created_at?: string
          created_by?: string
          credential_ref?: string
          exclusion_rules?: Json | null
          granted_scopes?: Json
          id?: string
          last_synced_at?: string | null
          owner_user_id?: string | null
          scope?: string
          status?: string
          sync_cursor?: Json | null
          webhook_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connections_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_schemas: {
        Row: {
          connector_type: string
          id: string
          last_discovered_at: string
          schema: Json
        }
        Insert: {
          connector_type: string
          id?: string
          last_discovered_at?: string
          schema?: Json
        }
        Update: {
          connector_type?: string
          id?: string
          last_discovered_at?: string
          schema?: Json
        }
        Relationships: []
      }
      cost_events: {
        Row: {
          agent_run_id: string | null
          cost_usd: number | null
          created_at: string
          event_type: string
          id: string
          job_run_id: string | null
          model: string | null
          tokens_input: number | null
          tokens_output: number | null
          user_id: string | null
        }
        Insert: {
          agent_run_id?: string | null
          cost_usd?: number | null
          created_at?: string
          event_type: string
          id?: string
          job_run_id?: string | null
          model?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          user_id?: string | null
        }
        Update: {
          agent_run_id?: string | null
          cost_usd?: number | null
          created_at?: string
          event_type?: string
          id?: string
          job_run_id?: string | null
          model?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_events_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_events_job_run_id_fkey"
            columns: ["job_run_id"]
            isOneToOne: false
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      improvement_suggestions: {
        Row: {
          category: string
          created_at: string
          evidence: Json | null
          id: string
          proposed_change: Json
          reasoning: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_config_id: string | null
          title: string
        }
        Insert: {
          category: string
          created_at?: string
          evidence?: Json | null
          id?: string
          proposed_change: Json
          reasoning: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_config_id?: string | null
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          evidence?: Json | null
          id?: string
          proposed_change?: Json
          reasoning?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_config_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "improvement_suggestions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "improvement_suggestions_target_config_id_fkey"
            columns: ["target_config_id"]
            isOneToOne: false
            referencedRelation: "agent_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runs: {
        Row: {
          acting_user_id: string | null
          completed_at: string | null
          cost_usd: number | null
          error: string | null
          id: string
          job_type: string
          output: Json | null
          routine_id: string | null
          started_at: string
          status: string
          tokens_used: number | null
          triggered_by: string
        }
        Insert: {
          acting_user_id?: string | null
          completed_at?: string | null
          cost_usd?: number | null
          error?: string | null
          id?: string
          job_type: string
          output?: Json | null
          routine_id?: string | null
          started_at?: string
          status?: string
          tokens_used?: number | null
          triggered_by: string
        }
        Update: {
          acting_user_id?: string | null
          completed_at?: string | null
          cost_usd?: number | null
          error?: string | null
          id?: string
          job_type?: string
          output?: Json | null
          routine_id?: string | null
          started_at?: string
          status?: string
          tokens_used?: number | null
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_runs_acting_user_id_fkey"
            columns: ["acting_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_runs_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
      memories: {
        Row: {
          agent_task_id: string | null
          author_id: string | null
          author_type: string
          content: string
          content_hash: string
          created_at: string
          embedding: string | null
          embedding_model: string | null
          embedding_model_version: string | null
          id: string
          last_retrieved_at: string | null
          namespace: string
          retrieval_count: number
          search_vector: unknown
          sensitivity_level: string
          source_refs: Json | null
          status: string
          type: string
          updated_at: string
          utility_score: number
          valid_from: string
          valid_to: string | null
          zone: string | null
        }
        Insert: {
          agent_task_id?: string | null
          author_id?: string | null
          author_type: string
          content: string
          content_hash: string
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          embedding_model_version?: string | null
          id?: string
          last_retrieved_at?: string | null
          namespace?: string
          retrieval_count?: number
          search_vector?: unknown
          sensitivity_level?: string
          source_refs?: Json | null
          status?: string
          type: string
          updated_at?: string
          utility_score?: number
          valid_from?: string
          valid_to?: string | null
          zone?: string | null
        }
        Update: {
          agent_task_id?: string | null
          author_id?: string | null
          author_type?: string
          content?: string
          content_hash?: string
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          embedding_model_version?: string | null
          id?: string
          last_retrieved_at?: string | null
          namespace?: string
          retrieval_count?: number
          search_vector?: unknown
          sensitivity_level?: string
          source_refs?: Json | null
          status?: string
          type?: string
          updated_at?: string
          utility_score?: number
          valid_from?: string
          valid_to?: string | null
          zone?: string | null
        }
        Relationships: []
      }
      memory_feedback: {
        Row: {
          created_at: string
          feedback_type: string
          id: string
          memory_id: string
          note: string | null
          rating: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          feedback_type: string
          id?: string
          memory_id: string
          note?: string | null
          rating?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          feedback_type?: string
          id?: string
          memory_id?: string
          note?: string | null
          rating?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_feedback_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "memories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_proposals: {
        Row: {
          acting_user_id: string | null
          agent_id: string | null
          claim: string
          confidence: number
          created_at: string
          entity_refs: Json | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          sources: Json | null
          status: string
          suggested_type: string
          task_id: string | null
        }
        Insert: {
          acting_user_id?: string | null
          agent_id?: string | null
          claim: string
          confidence: number
          created_at?: string
          entity_refs?: Json | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sources?: Json | null
          status?: string
          suggested_type: string
          task_id?: string | null
        }
        Update: {
          acting_user_id?: string | null
          agent_id?: string | null
          claim?: string
          confidence?: number
          created_at?: string
          entity_refs?: Json | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sources?: Json | null
          status?: string
          suggested_type?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memory_proposals_acting_user_id_fkey"
            columns: ["acting_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_proposals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      miss_log: {
        Row: {
          agent_run_id: string | null
          created_at: string
          id: string
          query: string
          reason: string
          resolved: boolean
          user_id: string | null
        }
        Insert: {
          agent_run_id?: string | null
          created_at?: string
          id?: string
          query: string
          reason: string
          resolved?: boolean
          user_id?: string | null
        }
        Update: {
          agent_run_id?: string | null
          created_at?: string
          id?: string
          query?: string
          reason?: string
          resolved?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "miss_log_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "miss_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          clearance_level: string
          created_at: string
          id: string
          name: string
          permissions: Json
        }
        Insert: {
          clearance_level: string
          created_at?: string
          id?: string
          name: string
          permissions?: Json
        }
        Update: {
          clearance_level?: string
          created_at?: string
          id?: string
          name?: string
          permissions?: Json
        }
        Relationships: []
      }
      routines: {
        Row: {
          additional_context: string | null
          agent_config_id: string
          created_at: string
          created_by: string
          cron_schedule: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          output_config: Json
          output_type: string
          scope: string
          trigger_type: string
          updated_at: string
          webhook_connector: string | null
          webhook_event: string | null
          webhook_filters: Json | null
        }
        Insert: {
          additional_context?: string | null
          agent_config_id: string
          created_at?: string
          created_by: string
          cron_schedule?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          output_config?: Json
          output_type: string
          scope?: string
          trigger_type: string
          updated_at?: string
          webhook_connector?: string | null
          webhook_event?: string | null
          webhook_filters?: Json | null
        }
        Update: {
          additional_context?: string | null
          agent_config_id?: string
          created_at?: string
          created_by?: string
          cron_schedule?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          output_config?: Json
          output_type?: string
          scope?: string
          trigger_type?: string
          updated_at?: string
          webhook_connector?: string | null
          webhook_event?: string | null
          webhook_filters?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "routines_agent_config_id_fkey"
            columns: ["agent_config_id"]
            isOneToOne: false
            referencedRelation: "agent_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "system_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tools: {
        Row: {
          action_type: string
          connector_type: string
          description: string
          id: string
          input_schema: Json
          is_active: boolean
          name: string
          output_schema: Json
          required_permission: string
        }
        Insert: {
          action_type: string
          connector_type: string
          description: string
          id?: string
          input_schema?: Json
          is_active?: boolean
          name: string
          output_schema?: Json
          required_permission: string
        }
        Update: {
          action_type?: string
          connector_type?: string
          description?: string
          id?: string
          input_schema?: Json
          is_active?: boolean
          name?: string
          output_schema?: Json
          required_permission?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          last_seen_at: string | null
          role_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          role_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          role_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      enqueue_job: { Args: { p_data: Json; p_name: string }; Returns: string }
      get_decrypted_credential: {
        Args: { p_connection_id: string }
        Returns: string
      }
      increment_retrieval_counts: {
        Args: { p_ids: string[] }
        Returns: undefined
      }
      refresh_credential: {
        Args: { p_connection_id: string; p_new_token: string }
        Returns: undefined
      }
      search_memories_hybrid: {
        Args: {
          p_clearance: number
          p_embedding: string
          p_floor: number
          p_max_results: number
          p_namespaces: string[]
          p_query_text: string
          p_zones: string[]
        }
        Returns: {
          agent_task_id: string
          author_id: string
          author_type: string
          content: string
          content_hash: string
          created_at: string
          embedding_model: string
          embedding_model_version: string
          id: string
          last_retrieved_at: string
          namespace: string
          retrieval_count: number
          sensitivity_level: string
          similarity_score: number
          source_refs: Json
          status: string
          type: string
          updated_at: string
          utility_score: number
          valid_from: string
          valid_to: string
          zone: string
        }[]
      }
      sensitivity_to_level: { Args: { s: string }; Returns: number }
      store_credential: {
        Args: { p_connection_id: string; p_token: string }
        Returns: undefined
      }
      user_clearance_level: { Args: never; Returns: number }
      user_role_name: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const
