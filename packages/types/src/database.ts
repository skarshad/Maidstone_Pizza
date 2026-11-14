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
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      has_role: {
        Args: { minimum: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      jwt_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      save_menu_item: { Args: { p: Json }; Returns: string }
      save_menu_option: { Args: { p: Json }; Returns: string }
    }
    Enums: {
      app_role: "customer" | "kitchen" | "manager" | "admin"
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
    },
  },
} as const
