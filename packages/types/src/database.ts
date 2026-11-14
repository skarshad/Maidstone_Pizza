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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      allergens: {
        Row: {
          code: string
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          name: string
          sort_order?: number
        }
        Update: {
          code?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          after: Json | null
          before: Json | null
          entity: string
          entity_id: string | null
          id: number
          occurred_at: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          after?: Json | null
          before?: Json | null
          entity: string
          entity_id?: string | null
          id?: never
          occurred_at?: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          after?: Json | null
          before?: Json | null
          entity?: string
          entity_id?: string | null
          id?: never
          occurred_at?: string
          reason?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string
          id: string
          is_published: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_published?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_published?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      customer_flags: {
        Row: {
          internal_notes: string | null
          is_blocked: boolean
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          internal_notes?: string | null
          is_blocked?: boolean
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          internal_notes?: string | null
          is_blocked?: boolean
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      delivery_zones: {
        Row: {
          fee_pence: number
          id: string
          is_active: boolean
          min_order_pence: number
          name: string
          postcode_prefixes: string[]
          sort_order: number
        }
        Insert: {
          fee_pence: number
          id?: string
          is_active?: boolean
          min_order_pence?: number
          name: string
          postcode_prefixes: string[]
          sort_order?: number
        }
        Update: {
          fee_pence?: number
          id?: string
          is_active?: boolean
          min_order_pence?: number
          name?: string
          postcode_prefixes?: string[]
          sort_order?: number
        }
        Relationships: []
      }
      dietary_tags: {
        Row: {
          code: string
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          name: string
          sort_order?: number
        }
        Update: {
          code?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      holiday_closures: {
        Row: {
          closed_on: string
          reason: string
        }
        Insert: {
          closed_on: string
          reason?: string
        }
        Update: {
          closed_on?: string
          reason?: string
        }
        Relationships: []
      }
      item_allergens: {
        Row: {
          allergen_code: string
          item_id: string
          may_contain: boolean
        }
        Insert: {
          allergen_code: string
          item_id: string
          may_contain?: boolean
        }
        Update: {
          allergen_code?: string
          item_id?: string
          may_contain?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "item_allergens_allergen_code_fkey"
            columns: ["allergen_code"]
            isOneToOne: false
            referencedRelation: "allergens"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "item_allergens_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_dietary_tags: {
        Row: {
          item_id: string
          tag_code: string
        }
        Insert: {
          item_id: string
          tag_code: string
        }
        Update: {
          item_id?: string
          tag_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_dietary_tags_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_dietary_tags_tag_code_fkey"
            columns: ["tag_code"]
            isOneToOne: false
            referencedRelation: "dietary_tags"
            referencedColumns: ["code"]
          },
        ]
      }
      item_option_groups: {
        Row: {
          free_select: number
          group_id: string
          item_id: string
          max_select: number | null
          sort_order: number
        }
        Insert: {
          free_select?: number
          group_id: string
          item_id: string
          max_select?: number | null
          sort_order?: number
        }
        Update: {
          free_select?: number
          group_id?: string
          item_id?: string
          max_select?: number | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "item_option_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "option_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_option_groups_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_variants: {
        Row: {
          id: string
          item_id: string
          name: string
          price_pence: number
          slug: string
          sort_order: number
        }
        Insert: {
          id?: string
          item_id: string
          name: string
          price_pence: number
          slug: string
          sort_order?: number
        }
        Update: {
          id?: string
          item_id?: string
          name?: string
          price_pence?: number
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "item_variants_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          created_at: string
          id: number
          kind: string
          last_error: string | null
          payload: Json
          run_after: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: never
          kind: string
          last_error?: string | null
          payload?: Json
          run_after?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: never
          kind?: string
          last_error?: string | null
          payload?: Json
          run_after?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      menu_items: {
        Row: {
          allergens_confirmed: boolean
          category_id: string
          created_at: string
          description: string
          id: string
          image_path: string | null
          is_published: boolean
          name: string
          slug: string
          sold_out_until: string | null
          sort_order: number
          source_ref: string | null
          updated_at: string
          vat_rate_bp: number
        }
        Insert: {
          allergens_confirmed?: boolean
          category_id: string
          created_at?: string
          description?: string
          id?: string
          image_path?: string | null
          is_published?: boolean
          name: string
          slug: string
          sold_out_until?: string | null
          sort_order?: number
          source_ref?: string | null
          updated_at?: string
          vat_rate_bp?: number
        }
        Update: {
          allergens_confirmed?: boolean
          category_id?: string
          created_at?: string
          description?: string
          id?: string
          image_path?: string | null
          is_published?: boolean
          name?: string
          slug?: string
          sold_out_until?: string | null
          sort_order?: number
          source_ref?: string | null
          updated_at?: string
          vat_rate_bp?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      opening_hours: {
        Row: {
          closes: string
          is_closed: boolean
          opens: string
          weekday: number
        }
        Insert: {
          closes: string
          is_closed?: boolean
          opens: string
          weekday: number
        }
        Update: {
          closes?: string
          is_closed?: boolean
          opens?: string
          weekday?: number
        }
        Relationships: []
      }
      option_allergens: {
        Row: {
          allergen_code: string
          may_contain: boolean
          option_id: string
        }
        Insert: {
          allergen_code: string
          may_contain?: boolean
          option_id: string
        }
        Update: {
          allergen_code?: string
          may_contain?: boolean
          option_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "option_allergens_allergen_code_fkey"
            columns: ["allergen_code"]
            isOneToOne: false
            referencedRelation: "allergens"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "option_allergens_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "options"
            referencedColumns: ["id"]
          },
        ]
      }
      option_groups: {
        Row: {
          id: string
          max_select: number | null
          min_select: number
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          id?: string
          max_select?: number | null
          min_select?: number
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          id?: string
          max_select?: number | null
          min_select?: number
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      option_prices: {
        Row: {
          option_id: string
          price_pence: number
          variant_slug: string
        }
        Insert: {
          option_id: string
          price_pence: number
          variant_slug: string
        }
        Update: {
          option_id?: string
          price_pence?: number
          variant_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "option_prices_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "options"
            referencedColumns: ["id"]
          },
        ]
      }
      options: {
        Row: {
          group_id: string
          id: string
          is_published: boolean
          name: string
          price_pence: number
          slug: string
          sold_out_until: string | null
          sort_order: number
        }
        Insert: {
          group_id: string
          id?: string
          is_published?: boolean
          name: string
          price_pence?: number
          slug: string
          sold_out_until?: string | null
          sort_order?: number
        }
        Update: {
          group_id?: string
          id?: string
          is_published?: boolean
          name?: string
          price_pence?: number
          slug?: string
          sold_out_until?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "option_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_options: {
        Row: {
          group_name: string
          id: string
          name: string
          option_id: string | null
          order_item_id: string
          price_pence: number
          sort_order: number
        }
        Insert: {
          group_name: string
          id?: string
          name: string
          option_id?: string | null
          order_item_id: string
          price_pence?: number
          sort_order?: number
        }
        Update: {
          group_name?: string
          id?: string
          name?: string
          option_id?: string | null
          order_item_id?: string
          price_pence?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_item_options_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_options_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          allergens: Json
          allergens_confirmed: boolean
          done_at: string | null
          id: string
          item_id: string | null
          line_total_pence: number
          name: string
          notes: string
          options_pence: number
          order_id: string
          quantity: number
          sort_order: number
          unit_price_pence: number
          variant_name: string
          vat_rate_bp: number
        }
        Insert: {
          allergens?: Json
          allergens_confirmed?: boolean
          done_at?: string | null
          id?: string
          item_id?: string | null
          line_total_pence: number
          name: string
          notes?: string
          options_pence?: number
          order_id: string
          quantity: number
          sort_order?: number
          unit_price_pence: number
          variant_name: string
          vat_rate_bp: number
        }
        Update: {
          allergens?: Json
          allergens_confirmed?: boolean
          done_at?: string | null
          id?: string
          item_id?: string | null
          line_total_pence?: number
          name?: string
          notes?: string
          options_pence?: number
          order_id?: string
          quantity?: number
          sort_order?: number
          unit_price_pence?: number
          variant_name?: string
          vat_rate_bp?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_events: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: number
          order_id: string
          reason: string | null
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: never
          order_id: string
          reason?: string | null
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: never
          order_id?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_transitions: {
        Row: {
          from_status: Database["public"]["Enums"]["order_status"]
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          from_status: Database["public"]["Enums"]["order_status"]
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          from_status?: Database["public"]["Enums"]["order_status"]
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: []
      }
      orders: {
        Row: {
          accepted_prep_minutes: number | null
          address: Json | null
          allergen_acknowledged: boolean
          channel: string
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string
          delivery_fee_pence: number
          delivery_zone_id: string | null
          discount_pence: number
          estimated_ready_at: string
          fulfilment: string
          guest_token_hash: string | null
          id: string
          idempotency_key: string | null
          notes: string
          order_number: number
          paid_at: string | null
          payment_method: string
          reject_reason: string | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal_pence: number
          tip_pence: number
          total_pence: number
          updated_at: string
          user_id: string | null
          vat_pence: number
        }
        Insert: {
          accepted_prep_minutes?: number | null
          address?: Json | null
          allergen_acknowledged: boolean
          channel?: string
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone: string
          delivery_fee_pence?: number
          delivery_zone_id?: string | null
          discount_pence?: number
          estimated_ready_at: string
          fulfilment: string
          guest_token_hash?: string | null
          id?: string
          idempotency_key?: string | null
          notes?: string
          order_number?: never
          paid_at?: string | null
          payment_method?: string
          reject_reason?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_pence: number
          tip_pence?: number
          total_pence: number
          updated_at?: string
          user_id?: string | null
          vat_pence: number
        }
        Update: {
          accepted_prep_minutes?: number | null
          address?: Json | null
          allergen_acknowledged?: boolean
          channel?: string
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string
          delivery_fee_pence?: number
          delivery_zone_id?: string | null
          discount_pence?: number
          estimated_ready_at?: string
          fulfilment?: string
          guest_token_hash?: string | null
          id?: string
          idempotency_key?: string | null
          notes?: string
          order_number?: never
          paid_at?: string | null
          payment_method?: string
          reject_reason?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_pence?: number
          tip_pence?: number
          total_pence?: number
          updated_at?: string
          user_id?: string | null
          vat_pence?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_delivery_zone_id_fkey"
            columns: ["delivery_zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          event_id: string
          event_type: string
          outcome: string | null
          provider_ref: string | null
          received_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          outcome?: string | null
          provider_ref?: string | null
          received_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          outcome?: string | null
          provider_ref?: string | null
          received_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_pence: number
          created_at: string
          disputed: boolean
          id: string
          order_id: string
          provider: string
          provider_ref: string
          refunded_pence: number
          status: string
          updated_at: string
        }
        Insert: {
          amount_pence: number
          created_at?: string
          disputed?: boolean
          id?: string
          order_id: string
          provider: string
          provider_ref: string
          refunded_pence?: number
          status?: string
          updated_at?: string
        }
        Update: {
          amount_pence?: number
          created_at?: string
          disputed?: boolean
          id?: string
          order_id?: string
          provider?: string
          provider_ref?: string
          refunded_pence?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          marketing_opt_in: boolean
          marketing_opt_in_at: string | null
          phone: string | null
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          marketing_opt_in?: boolean
          marketing_opt_in_at?: string | null
          phone?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          marketing_opt_in?: boolean
          marketing_opt_in_at?: string | null
          phone?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      shop_settings: {
        Row: {
          busy_extra_minutes: number
          busy_mode: boolean
          cash_enabled: boolean
          collection_minutes: number
          delivery_minutes: number
          id: boolean
          max_schedule_days: number
          ordering_paused: boolean
          paused_message: string
          pending_payment_minutes: number
          shop_name: string
          slot_minutes: number
          timezone: string
          tips_enabled: boolean
          updated_at: string
        }
        Insert: {
          busy_extra_minutes?: number
          busy_mode?: boolean
          cash_enabled?: boolean
          collection_minutes?: number
          delivery_minutes?: number
          id?: boolean
          max_schedule_days?: number
          ordering_paused?: boolean
          paused_message?: string
          pending_payment_minutes?: number
          shop_name?: string
          slot_minutes?: number
          timezone?: string
          tips_enabled?: boolean
          updated_at?: string
        }
        Update: {
          busy_extra_minutes?: number
          busy_mode?: boolean
          cash_enabled?: boolean
          collection_minutes?: number
          delivery_minutes?: number
          id?: boolean
          max_schedule_days?: number
          ordering_paused?: boolean
          paused_message?: string
          pending_payment_minutes?: number
          shop_name?: string
          slot_minutes?: number
          timezone?: string
          tips_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_jobs: {
        Args: { p_kinds: string[]; p_limit: number }
        Returns: {
          attempts: number
          created_at: string
          id: number
          kind: string
          last_error: string | null
          payload: Json
          run_after: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_order: { Args: { p: Json }; Returns: Json }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      expire_pending_orders: {
        Args: never
        Returns: {
          order_id: string
          provider_ref: string
        }[]
      }
      finish_job: {
        Args: { p_error: string; p_id: number; p_ok: boolean }
        Returns: undefined
      }
      has_role: {
        Args: { minimum: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      jwt_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      kitchen_accept_order: {
        Args: {
          p_actor_id: string
          p_actor_role: string
          p_order_id: string
          p_prep_minutes: number
        }
        Returns: Database["public"]["Enums"]["order_status"]
      }
      kitchen_reject_order: {
        Args: {
          p_actor_id: string
          p_actor_role: string
          p_order_id: string
          p_reason: string
        }
        Returns: Database["public"]["Enums"]["order_status"]
      }
      kitchen_set_item_done: {
        Args: { p_done: boolean; p_item_id: string; p_order_id: string }
        Returns: boolean
      }
      notify_kitchen: {
        Args: { p_order_id: string; p_status: string }
        Returns: undefined
      }
      record_payment_event: { Args: { p: Json }; Returns: string }
      save_menu_item: { Args: { p: Json }; Returns: string }
      save_menu_option: { Args: { p: Json }; Returns: string }
      transition_order: {
        Args: {
          p_actor_id: string
          p_actor_role: string
          p_order_id: string
          p_reason: string
          p_to: Database["public"]["Enums"]["order_status"]
        }
        Returns: Database["public"]["Enums"]["order_status"]
      }
    }
    Enums: {
      app_role: "customer" | "kitchen" | "manager" | "admin"
      order_status:
        | "PENDING_PAYMENT"
        | "RECEIVED"
        | "ACCEPTED"
        | "PREPARING"
        | "READY"
        | "OUT_FOR_DELIVERY"
        | "COLLECTED"
        | "COMPLETED"
        | "REJECTED"
        | "CANCELLED"
        | "REFUNDED"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["customer", "kitchen", "manager", "admin"],
      order_status: [
        "PENDING_PAYMENT",
        "RECEIVED",
        "ACCEPTED",
        "PREPARING",
        "READY",
        "OUT_FOR_DELIVERY",
        "COLLECTED",
        "COMPLETED",
        "REJECTED",
        "CANCELLED",
        "REFUNDED",
      ],
    },
  },
} as const
