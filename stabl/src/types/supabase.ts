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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          car_id: string | null
          created_at: string | null
          deposit_amount: number | null
          deposit_forfeited: boolean | null
          id: string
          location_address: string | null
          location_lat: number | null
          location_lng: number | null
          notes: string | null
          provider_id: string | null
          scheduled_at: string
          services: Json
          status: string
          stripe_payment_id: string | null
          total_estimate: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          car_id?: string | null
          created_at?: string | null
          deposit_amount?: number | null
          deposit_forfeited?: boolean | null
          id?: string
          location_address?: string | null
          location_lat?: number | null
          location_lng?: number | null
          notes?: string | null
          provider_id?: string | null
          scheduled_at: string
          services?: Json
          status: string
          stripe_payment_id?: string | null
          total_estimate?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          car_id?: string | null
          created_at?: string | null
          deposit_amount?: number | null
          deposit_forfeited?: boolean | null
          id?: string
          location_address?: string | null
          location_lat?: number | null
          location_lng?: number | null
          notes?: string | null
          provider_id?: string | null
          scheduled_at?: string
          services?: Json
          status?: string
          stripe_payment_id?: string | null
          total_estimate?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_car_id_fkey"
            columns: ["car_id"]
            isOneToOne: false
            referencedRelation: "user_car_information"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      message_threads: {
        Row: {
          appointment_id: string | null
          created_at: string | null
          customer_id: string | null
          id: string
          provider_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          provider_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          provider_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_threads_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          image_url: string | null
          is_flagged: boolean | null
          sender_id: string | null
          thread_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_flagged?: boolean | null
          sender_id?: string | null
          thread_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_flagged?: boolean | null
          sender_id?: string | null
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          metadata: Json | null
          title: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          metadata?: Json | null
          title?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          metadata?: Json | null
          title?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_services: {
        Row: {
          catalog_id: string | null
          category: string | null
          created_at: string | null
          description: string | null
          duration_mins: number | null
          id: string
          is_active: boolean | null
          is_approved: boolean | null
          is_custom: boolean | null
          name: string
          price: number | null
          provider_id: string | null
          sort_order: number | null
        }
        Insert: {
          catalog_id?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          duration_mins?: number | null
          id?: string
          is_active?: boolean | null
          is_approved?: boolean | null
          is_custom?: boolean | null
          name: string
          price?: number | null
          provider_id?: string | null
          sort_order?: number | null
        }
        Update: {
          catalog_id?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          duration_mins?: number | null
          id?: string
          is_active?: boolean | null
          is_approved?: boolean | null
          is_custom?: boolean | null
          name?: string
          price?: number | null
          provider_id?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_services_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_services_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_types: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          label: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string
          name?: string
        }
        Relationships: []
      }
      providers: {
        Row: {
          bio: string | null
          created_at: string | null
          id: string
          is_approved: boolean | null
          mile_radius: number | null
          provider_type_id: string | null
          rating: number | null
          user_id: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string | null
          id?: string
          is_approved?: boolean | null
          mile_radius?: number | null
          provider_type_id?: string | null
          rating?: number | null
          user_id?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string | null
          id?: string
          is_approved?: boolean | null
          mile_radius?: number | null
          provider_type_id?: string | null
          rating?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "providers_provider_type_id_fkey"
            columns: ["provider_type_id"]
            isOneToOne: false
            referencedRelation: "provider_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "providers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          appointment_id: string | null
          created_at: string | null
          description: string | null
          id: string
          images: string[] | null
          kudos_points: number | null
          provider_id: string | null
          rating: number
          title: string | null
          user_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          images?: string[] | null
          kudos_points?: number | null
          provider_id?: string | null
          rating: number
          title?: string | null
          user_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          images?: string[] | null
          kudos_points?: number | null
          provider_id?: string | null
          rating?: number
          title?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      service_catalog: {
        Row: {
          category: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          provider_type_id: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          provider_type_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          provider_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_catalog_provider_type_id_fkey"
            columns: ["provider_type_id"]
            isOneToOne: false
            referencedRelation: "provider_types"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string | null
          frequency: string | null
          id: string
          next_scheduled_at: string | null
          provider_id: string | null
          services: Json
          status: string
          stripe_subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          frequency?: string | null
          id?: string
          next_scheduled_at?: string | null
          provider_id?: string | null
          services?: Json
          status: string
          stripe_subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          frequency?: string | null
          id?: string
          next_scheduled_at?: string | null
          provider_id?: string | null
          services?: Json
          status?: string
          stripe_subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_car_information: {
        Row: {
          id: string
          make: string
          model: string
          user_id: string | null
          vin: string | null
          year: number
        }
        Insert: {
          id?: string
          make: string
          model: string
          user_id?: string | null
          vin?: string | null
          year: number
        }
        Update: {
          id?: string
          make?: string
          model?: string
          user_id?: string | null
          vin?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_car_information_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_information: {
        Row: {
          address: string | null
          city: string | null
          id: string
          latitude: number | null
          longitude: number | null
          state: string | null
          user_id: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          state?: string | null
          user_id?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          state?: string | null
          user_id?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_information_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          first_name: string | null
          id: string
          is_provider: boolean | null
          last_name: string | null
          profile_pic: string | null
          stripe_customer_id: string | null
        }
        Insert: {
          created_at?: string | null
          first_name?: string | null
          id: string
          is_provider?: boolean | null
          last_name?: string | null
          profile_pic?: string | null
          stripe_customer_id?: string | null
        }
        Update: {
          created_at?: string | null
          first_name?: string | null
          id?: string
          is_provider?: boolean | null
          last_name?: string | null
          profile_pic?: string | null
          stripe_customer_id?: string | null
        }
        Relationships: []
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
