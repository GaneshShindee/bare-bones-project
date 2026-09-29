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
  public: {
    Tables: {
      email_history: {
        Row: {
          attachments: Json
          bcc: string | null
          body: string
          error: string | null
          first_opened_at: string | null
          gmail_account_id: string | null
          id: string
          last_opened_at: string | null
          open_count: number
          recipient: string
          recipient_count: number
          sender_email: string | null
          sent_at: string
          skipped: Json
          status: string
          subject: string
          template_id: string | null
          template_name: string | null
          tracking_enabled: boolean
          tracking_token: string | null
          user_id: string
        }
        Insert: {
          attachments?: Json
          bcc?: string | null
          body: string
          error?: string | null
          first_opened_at?: string | null
          gmail_account_id?: string | null
          id?: string
          last_opened_at?: string | null
          open_count?: number
          recipient: string
          recipient_count?: number
          sender_email?: string | null
          sent_at?: string
          skipped?: Json
          status?: string
          subject: string
          template_id?: string | null
          template_name?: string | null
          tracking_enabled?: boolean
          tracking_token?: string | null
          user_id: string
        }
        Update: {
          attachments?: Json
          bcc?: string | null
          body?: string
          error?: string | null
          first_opened_at?: string | null
          gmail_account_id?: string | null
          id?: string
          last_opened_at?: string | null
          open_count?: number
          recipient?: string
          recipient_count?: number
          sender_email?: string | null
          sent_at?: string
          skipped?: Json
          status?: string
          subject?: string
          template_id?: string | null
          template_name?: string | null
          tracking_enabled?: boolean
          tracking_token?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_history_gmail_account_id_fkey"
            columns: ["gmail_account_id"]
            isOneToOne: false
            referencedRelation: "gmail_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_history_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_opens: {
        Row: {
          browser: string | null
          city: string | null
          country: string | null
          device_type: string | null
          email_history_id: string
          email_recipient_id: string | null
          id: string
          ip: string | null
          opened_at: string
          os: string | null
          region: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country?: string | null
          device_type?: string | null
          email_history_id: string
          email_recipient_id?: string | null
          id?: string
          ip?: string | null
          opened_at?: string
          os?: string | null
          region?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          city?: string | null
          country?: string | null
          device_type?: string | null
          email_history_id?: string
          email_recipient_id?: string | null
          id?: string
          ip?: string | null
          opened_at?: string
          os?: string | null
          region?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_opens_email_history_id_fkey"
            columns: ["email_history_id"]
            isOneToOne: false
            referencedRelation: "email_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_opens_email_recipient_id_fkey"
            columns: ["email_recipient_id"]
            isOneToOne: false
            referencedRelation: "email_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      email_recipients: {
        Row: {
          click_count: number
          company: string | null
          created_at: string
          email: string
          email_history_id: string
          first_opened_at: string | null
          id: string
          last_clicked_at: string | null
          last_opened_at: string | null
          name: string | null
          open_count: number
          pdf_tracking_token: string | null
          status: string
          tracking_token: string | null
          user_id: string
        }
        Insert: {
          click_count?: number
          company?: string | null
          created_at?: string
          email: string
          email_history_id: string
          first_opened_at?: string | null
          id?: string
          last_clicked_at?: string | null
          last_opened_at?: string | null
          name?: string | null
          open_count?: number
          pdf_tracking_token?: string | null
          status?: string
          tracking_token?: string | null
          user_id: string
        }
        Update: {
          click_count?: number
          company?: string | null
          created_at?: string
          email?: string
          email_history_id?: string
          first_opened_at?: string | null
          id?: string
          last_clicked_at?: string | null
          last_opened_at?: string | null
          name?: string | null
          open_count?: number
          pdf_tracking_token?: string | null
          status?: string
          tracking_token?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_recipients_email_history_id_fkey"
            columns: ["email_history_id"]
            isOneToOne: false
            referencedRelation: "email_history"
            referencedColumns: ["id"]
          },
        ]
      }
      email_replies: {
        Row: {
          body: string | null
          created_at: string
          email_history_id: string | null
          email_recipient_id: string | null
          from_email: string
          from_name: string | null
          gmail_account_id: string | null
          gmail_message_id: string
          gmail_thread_id: string | null
          id: string
          is_archived: boolean
          is_read: boolean
          received_at: string
          snippet: string | null
          subject: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          email_history_id?: string | null
          email_recipient_id?: string | null
          from_email: string
          from_name?: string | null
          gmail_account_id?: string | null
          gmail_message_id: string
          gmail_thread_id?: string | null
          id?: string
          is_archived?: boolean
          is_read?: boolean
          received_at?: string
          snippet?: string | null
          subject?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          email_history_id?: string | null
          email_recipient_id?: string | null
          from_email?: string
          from_name?: string | null
          gmail_account_id?: string | null
          gmail_message_id?: string
          gmail_thread_id?: string | null
          id?: string
          is_archived?: boolean
          is_read?: boolean
          received_at?: string
          snippet?: string | null
          subject?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_replies_email_history_id_fkey"
            columns: ["email_history_id"]
            isOneToOne: false
            referencedRelation: "email_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_replies_email_recipient_id_fkey"
            columns: ["email_recipient_id"]
            isOneToOne: false
            referencedRelation: "email_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_replies_gmail_account_id_fkey"
            columns: ["gmail_account_id"]
            isOneToOne: false
            referencedRelation: "gmail_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_queue: {
        Row: {
          campaign_id: string | null
          company: string | null
          condition: string
          created_at: string
          gmail_connection_id: string | null
          id: string
          last_open_at: string | null
          notes: string | null
          open_count: number
          pdf_click_at: string | null
          priority: number
          recipient_email: string
          recipient_id: string | null
          recipient_name: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: string
          suggested_resume_version_id: string | null
          suggested_template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          company?: string | null
          condition?: string
          created_at?: string
          gmail_connection_id?: string | null
          id?: string
          last_open_at?: string | null
          notes?: string | null
          open_count?: number
          pdf_click_at?: string | null
          priority?: number
          recipient_email: string
          recipient_id?: string | null
          recipient_name?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          suggested_resume_version_id?: string | null
          suggested_template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          company?: string | null
          condition?: string
          created_at?: string
          gmail_connection_id?: string | null
          id?: string
          last_open_at?: string | null
          notes?: string | null
          open_count?: number
          pdf_click_at?: string | null
          priority?: number
          recipient_email?: string
          recipient_id?: string | null
          recipient_name?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          suggested_resume_version_id?: string | null
          suggested_template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "followup_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_queue_gmail_connection_id_fkey"
            columns: ["gmail_connection_id"]
            isOneToOne: false
            referencedRelation: "gmail_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_queue_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "email_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_queue_suggested_resume_version_id_fkey"
            columns: ["suggested_resume_version_id"]
            isOneToOne: false
            referencedRelation: "resume_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_queue_suggested_template_id_fkey"
            columns: ["suggested_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_connections: {
        Row: {
          access_token: string | null
          avatar_url: string | null
          connected_at: string
          display_name: string | null
          expires_at: string | null
          full_name: string | null
          gmail_email: string
          id: string
          is_default: boolean
          label: string | null
          last_history_id: string | null
          last_synced_at: string | null
          reads_enabled: boolean
          refresh_token: string
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          avatar_url?: string | null
          connected_at?: string
          display_name?: string | null
          expires_at?: string | null
          full_name?: string | null
          gmail_email: string
          id?: string
          is_default?: boolean
          label?: string | null
          last_history_id?: string | null
          last_synced_at?: string | null
          reads_enabled?: boolean
          refresh_token: string
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          avatar_url?: string | null
          connected_at?: string
          display_name?: string | null
          expires_at?: string | null
          full_name?: string | null
          gmail_email?: string
          id?: string
          is_default?: boolean
          label?: string | null
          last_history_id?: string | null
          last_synced_at?: string | null
          reads_enabled?: boolean
          refresh_token?: string
          scope?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      instruction_templates: {
        Row: {
          batch_size: number
          company_domain: string
          created_at: string
          custom_pattern: string
          custom_rules: Json
          email_pattern: string
          id: string
          name: string
          prefixes: Json
          rules: Json
          surname_min_length: number
          updated_at: string
          user_id: string
        }
        Insert: {
          batch_size?: number
          company_domain?: string
          created_at?: string
          custom_pattern?: string
          custom_rules?: Json
          email_pattern?: string
          id?: string
          name: string
          prefixes?: Json
          rules?: Json
          surname_min_length?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          batch_size?: number
          company_domain?: string
          created_at?: string
          custom_pattern?: string
          custom_rules?: Json
          email_pattern?: string
          id?: string
          name?: string
          prefixes?: Json
          rules?: Json
          surname_min_length?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      job_bookmarks: {
        Row: {
          created_at: string
          job_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          job_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          job_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_bookmarks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          apply_url: string | null
          company: string
          company_website: string | null
          created_at: string
          description: string | null
          employment_type: string | null
          experience: string | null
          id: string
          is_public: boolean
          location: string | null
          recruiter_email: string | null
          responsibilities: string[]
          salary: string | null
          skills: string[]
          source_url: string | null
          tags: string[]
          technologies: string[]
          title: string
          updated_at: string
          user_id: string
          work_mode: string | null
        }
        Insert: {
          apply_url?: string | null
          company: string
          company_website?: string | null
          created_at?: string
          description?: string | null
          employment_type?: string | null
          experience?: string | null
          id?: string
          is_public?: boolean
          location?: string | null
          recruiter_email?: string | null
          responsibilities?: string[]
          salary?: string | null
          skills?: string[]
          source_url?: string | null
          tags?: string[]
          technologies?: string[]
          title: string
          updated_at?: string
          user_id: string
          work_mode?: string | null
        }
        Update: {
          apply_url?: string | null
          company?: string
          company_website?: string | null
          created_at?: string
          description?: string | null
          employment_type?: string | null
          experience?: string | null
          id?: string
          is_public?: boolean
          location?: string | null
          recruiter_email?: string | null
          responsibilities?: string[]
          salary?: string | null
          skills?: string[]
          source_url?: string | null
          tags?: string[]
          technologies?: string[]
          title?: string
          updated_at?: string
          user_id?: string
          work_mode?: string | null
        }
        Relationships: []
      }
      pdf_events: {
        Row: {
          browser: string | null
          city: string | null
          country: string | null
          created_at: string
          device_type: string | null
          email_history_id: string | null
          email_recipient_id: string | null
          event_type: string
          filename: string | null
          id: string
          ip: string | null
          os: string | null
          region: string | null
          tracking_token: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          email_history_id?: string | null
          email_recipient_id?: string | null
          event_type?: string
          filename?: string | null
          id?: string
          ip?: string | null
          os?: string | null
          region?: string | null
          tracking_token: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          email_history_id?: string | null
          email_recipient_id?: string | null
          event_type?: string
          filename?: string | null
          id?: string
          ip?: string | null
          os?: string | null
          region?: string | null
          tracking_token?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdf_events_email_history_id_fkey"
            columns: ["email_history_id"]
            isOneToOne: false
            referencedRelation: "email_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdf_events_email_recipient_id_fkey"
            columns: ["email_recipient_id"]
            isOneToOne: false
            referencedRelation: "email_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          compose_prefs: Json
          created_at: string
          default_gmail_connection_id: string | null
          default_template_id: string | null
          email: string | null
          follow_up_template_id: string | null
          full_name: string | null
          id: string
          tracking_open_enabled: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          compose_prefs?: Json
          created_at?: string
          default_gmail_connection_id?: string | null
          default_template_id?: string | null
          email?: string | null
          follow_up_template_id?: string | null
          full_name?: string | null
          id: string
          tracking_open_enabled?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          compose_prefs?: Json
          created_at?: string
          default_gmail_connection_id?: string | null
          default_template_id?: string | null
          email?: string | null
          follow_up_template_id?: string | null
          full_name?: string | null
          id?: string
          tracking_open_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_gmail_connection_id_fkey"
            columns: ["default_gmail_connection_id"]
            isOneToOne: false
            referencedRelation: "gmail_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_default_template_id_fkey"
            columns: ["default_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_follow_up_template_id_fkey"
            columns: ["follow_up_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          main_tex_filename: string
          name: string
          storage_prefix: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          main_tex_filename?: string
          name: string
          storage_prefix: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          main_tex_filename?: string
          name?: string
          storage_prefix?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      resume_prompt_templates: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          prompt: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          prompt?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          prompt?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      resume_versions: {
        Row: {
          ats_score: number | null
          company: string | null
          created_at: string
          custom_instructions: string | null
          id: string
          job_description: string
          job_title: string | null
          matched_keywords: Json
          missing_keywords: Json
          pdf_storage_path: string | null
          project_id: string
          strengths: Json
          suggestions: Json
          tex_content: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ats_score?: number | null
          company?: string | null
          created_at?: string
          custom_instructions?: string | null
          id?: string
          job_description: string
          job_title?: string | null
          matched_keywords?: Json
          missing_keywords?: Json
          pdf_storage_path?: string | null
          project_id: string
          strengths?: Json
          suggestions?: Json
          tex_content: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ats_score?: number | null
          company?: string | null
          created_at?: string
          custom_instructions?: string | null
          id?: string
          job_description?: string
          job_title?: string | null
          matched_keywords?: Json
          missing_keywords?: Json
          pdf_storage_path?: string | null
          project_id?: string
          strengths?: Json
          suggestions?: Json
          tex_content?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "resume_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      resumes: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          mime_type: string
          name: string
          original_filename: string
          size_bytes: number
          storage_path: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          mime_type: string
          name: string
          original_filename: string
          size_bytes: number
          storage_path: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          mime_type?: string
          name?: string
          original_filename?: string
          size_bytes?: number
          storage_path?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      template_saves: {
        Row: {
          created_at: string
          id: string
          template_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          template_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_saves_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          body: string
          category: string | null
          created_at: string
          default_sender_id: string | null
          follow_up_template_id: string | null
          id: string
          is_default: boolean
          is_public: boolean
          name: string
          preferred_resume_id: string | null
          published_at: string | null
          saves_count: number
          source_template_id: string | null
          subject: string
          updated_at: string
          user_id: string
          uses_count: number
        }
        Insert: {
          body?: string
          category?: string | null
          created_at?: string
          default_sender_id?: string | null
          follow_up_template_id?: string | null
          id?: string
          is_default?: boolean
          is_public?: boolean
          name: string
          preferred_resume_id?: string | null
          published_at?: string | null
          saves_count?: number
          source_template_id?: string | null
          subject?: string
          updated_at?: string
          user_id: string
          uses_count?: number
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          default_sender_id?: string | null
          follow_up_template_id?: string | null
          id?: string
          is_default?: boolean
          is_public?: boolean
          name?: string
          preferred_resume_id?: string | null
          published_at?: string | null
          saves_count?: number
          source_template_id?: string | null
          subject?: string
          updated_at?: string
          user_id?: string
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "templates_default_sender_id_fkey"
            columns: ["default_sender_id"]
            isOneToOne: false
            referencedRelation: "gmail_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_follow_up_template_id_fkey"
            columns: ["follow_up_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_preferred_resume_id_fkey"
            columns: ["preferred_resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
