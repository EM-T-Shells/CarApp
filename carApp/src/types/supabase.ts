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
      booking_photos: {
        Row: {
          booking_id: string | null
          id: string
          photo_type: string
          storage_url: string
          uploaded_at: string | null
        }
        Insert: {
          booking_id?: string | null
          id?: string
          photo_type: string
          storage_url: string
          uploaded_at?: string | null
        }
        Update: {
          booking_id?: string | null
          id?: string
          photo_type?: string
          storage_url?: string
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_photos_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          completed_at: string | null
          created_at: string | null
          customer_id: string | null
          deposit_amount: number | null
          deposit_forfeited: boolean | null
          id: string
          location_lat: number | null
          location_lng: number | null
          notes: string | null
          package_id: string | null
          platform_fee: number | null
          provider_id: string | null
          provider_payout: number | null
          scheduled_at: string
          service_address: string | null
          service_fee: number | null
          service_location: unknown
          services: Json
          started_at: string | null
          status: string
          total_amount: number | null
          updated_at: string | null
          vehicle_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          deposit_amount?: number | null
          deposit_forfeited?: boolean | null
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          notes?: string | null
          package_id?: string | null
          platform_fee?: number | null
          provider_id?: string | null
          provider_payout?: number | null
          scheduled_at: string
          service_address?: string | null
          service_fee?: number | null
          service_location?: unknown
          services?: Json
          started_at?: string | null
          status?: string
          total_amount?: number | null
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          deposit_amount?: number | null
          deposit_forfeited?: boolean | null
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          notes?: string | null
          package_id?: string | null
          platform_fee?: number | null
          provider_id?: string | null
          provider_payout?: number | null
          scheduled_at?: string
          service_address?: string | null
          service_fee?: number | null
          service_location?: unknown
          services?: Json
          started_at?: string | null
          status?: string
          total_amount?: number | null
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "service_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      kudos: {
        Row: {
          badge: string
          booking_id: string | null
          created_at: string | null
          giver_id: string | null
          id: string
          receiver_id: string | null
        }
        Insert: {
          badge: string
          booking_id?: string | null
          created_at?: string | null
          giver_id?: string | null
          id?: string
          receiver_id?: string | null
        }
        Update: {
          badge?: string
          booking_id?: string | null
          created_at?: string | null
          giver_id?: string | null
          id?: string
          receiver_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kudos_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kudos_giver_id_fkey"
            columns: ["giver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kudos_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      message_threads: {
        Row: {
          booking_id: string | null
          created_at: string | null
          customer_id: string | null
          id: string
          provider_id: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          provider_id?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          provider_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_threads_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
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
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          id: string
          image_url: string | null
          is_flagged: boolean | null
          is_read: boolean | null
          sender_id: string | null
          sent_at: string | null
          thread_id: string | null
        }
        Insert: {
          body?: string | null
          id?: string
          image_url?: string | null
          is_flagged?: boolean | null
          is_read?: boolean | null
          sender_id?: string | null
          sent_at?: string | null
          thread_id?: string | null
        }
        Update: {
          body?: string | null
          id?: string
          image_url?: string | null
          is_flagged?: boolean | null
          is_read?: boolean | null
          sender_id?: string | null
          sent_at?: string | null
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
      payments: {
        Row: {
          amount: number | null
          booking_id: string | null
          id: string
          payment_type: string
          processed_at: string | null
          status: string
          stripe_payment_intent_id: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          booking_id?: string | null
          id?: string
          payment_type: string
          processed_at?: string | null
          status: string
          stripe_payment_intent_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          booking_id?: string | null
          id?: string
          payment_type?: string
          processed_at?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number | null
          booking_id: string | null
          id: string
          paid_at: string | null
          provider_id: string | null
          status: string
          stripe_transfer_id: string | null
        }
        Insert: {
          amount?: number | null
          booking_id?: string | null
          id?: string
          paid_at?: string | null
          provider_id?: string | null
          status: string
          stripe_transfer_id?: string | null
        }
        Update: {
          amount?: number | null
          booking_id?: string | null
          id?: string
          paid_at?: string | null
          provider_id?: string | null
          status?: string
          stripe_transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payouts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_redemptions: {
        Row: {
          amount_applied: number | null
          booking_id: string | null
          id: string
          promo_id: string | null
          redeemed_at: string | null
          user_id: string | null
        }
        Insert: {
          amount_applied?: number | null
          booking_id?: string | null
          id?: string
          promo_id?: string | null
          redeemed_at?: string | null
          user_id?: string | null
        }
        Update: {
          amount_applied?: number | null
          booking_id?: string | null
          id?: string
          promo_id?: string | null
          redeemed_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_promo_id_fkey"
            columns: ["promo_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          code: string
          created_at: string | null
          expires_at: string | null
          id: string
          issued_to: string | null
          promo_type: string
          uses_remaining: number | null
          value: number | null
          value_type: string
        }
        Insert: {
          code: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          issued_to?: string | null
          promo_type: string
          uses_remaining?: number | null
          value?: number | null
          value_type: string
        }
        Update: {
          code?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          issued_to?: string | null
          promo_type?: string
          uses_remaining?: number | null
          value?: number | null
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_issued_to_fkey"
            columns: ["issued_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_location_cache: {
        Row: {
          latitude: number
          longitude: number
          provider_id: string
          updated_at: string | null
        }
        Insert: {
          latitude: number
          longitude: number
          provider_id: string
          updated_at?: string | null
        }
        Update: {
          latitude?: number
          longitude?: number
          provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_location_cache_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_profiles: {
        Row: {
          approved_at: string | null
          avg_gear_rating: number | null
          bio: string | null
          coverage_area: string | null
          created_at: string | null
          id: string
          is_founding_provider: boolean | null
          kudos_count: number | null
          mile_radius: number | null
          platform_fee_rate: number | null
          provider_type_id: string | null
          stripe_account_id: string | null
          total_jobs: number | null
          user_id: string | null
          verification_status: string
        }
        Insert: {
          approved_at?: string | null
          avg_gear_rating?: number | null
          bio?: string | null
          coverage_area?: string | null
          created_at?: string | null
          id?: string
          is_founding_provider?: boolean | null
          kudos_count?: number | null
          mile_radius?: number | null
          platform_fee_rate?: number | null
          provider_type_id?: string | null
          stripe_account_id?: string | null
          total_jobs?: number | null
          user_id?: string | null
          verification_status?: string
        }
        Update: {
          approved_at?: string | null
          avg_gear_rating?: number | null
          bio?: string | null
          coverage_area?: string | null
          created_at?: string | null
          id?: string
          is_founding_provider?: boolean | null
          kudos_count?: number | null
          mile_radius?: number | null
          platform_fee_rate?: number | null
          provider_type_id?: string | null
          stripe_account_id?: string | null
          total_jobs?: number | null
          user_id?: string | null
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_profiles_provider_type_id_fkey"
            columns: ["provider_type_id"]
            isOneToOne: false
            referencedRelation: "provider_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
      provider_vetting: {
        Row: {
          background_status: string
          bank_status: string
          checkr_report_id: string | null
          created_at: string | null
          credentials_status: string
          id: string
          identity_status: string
          insurance_status: string
          persona_inquiry_id: string | null
          profile_completeness: number | null
          provider_id: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string | null
        }
        Insert: {
          background_status?: string
          bank_status?: string
          checkr_report_id?: string | null
          created_at?: string | null
          credentials_status?: string
          id?: string
          identity_status?: string
          insurance_status?: string
          persona_inquiry_id?: string | null
          profile_completeness?: number | null
          provider_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string | null
        }
        Update: {
          background_status?: string
          bank_status?: string
          checkr_report_id?: string | null
          created_at?: string | null
          credentials_status?: string
          id?: string
          identity_status?: string
          insurance_status?: string
          persona_inquiry_id?: string | null
          profile_completeness?: number | null
          provider_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_vetting_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_vetting_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          booking_id: string | null
          communication_score: number | null
          created_at: string | null
          dispute_window_end: string | null
          id: string
          is_flagged: boolean | null
          overall_score: number | null
          quality_score: number | null
          review_text: string | null
          reviewee_id: string | null
          reviewer_id: string | null
          timeliness_score: number | null
          value_score: number | null
        }
        Insert: {
          booking_id?: string | null
          communication_score?: number | null
          created_at?: string | null
          dispute_window_end?: string | null
          id?: string
          is_flagged?: boolean | null
          overall_score?: number | null
          quality_score?: number | null
          review_text?: string | null
          reviewee_id?: string | null
          reviewer_id?: string | null
          timeliness_score?: number | null
          value_score?: number | null
        }
        Update: {
          booking_id?: string | null
          communication_score?: number | null
          created_at?: string | null
          dispute_window_end?: string | null
          id?: string
          is_flagged?: boolean | null
          overall_score?: number | null
          quality_score?: number | null
          review_text?: string | null
          reviewee_id?: string | null
          reviewer_id?: string | null
          timeliness_score?: number | null
          value_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ratings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_reviewee_id_fkey"
            columns: ["reviewee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_reviewer_id_fkey"
            columns: ["reviewer_id"]
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
      service_packages: {
        Row: {
          base_price: number | null
          catalog_id: string | null
          category: string
          created_at: string | null
          description: string | null
          duration_mins: number | null
          id: string
          is_active: boolean | null
          is_approved: boolean | null
          is_custom: boolean | null
          name: string
          provider_id: string | null
          sort_order: number | null
        }
        Insert: {
          base_price?: number | null
          catalog_id?: string | null
          category: string
          created_at?: string | null
          description?: string | null
          duration_mins?: number | null
          id?: string
          is_active?: boolean | null
          is_approved?: boolean | null
          is_custom?: boolean | null
          name: string
          provider_id?: string | null
          sort_order?: number | null
        }
        Update: {
          base_price?: number | null
          catalog_id?: string | null
          category?: string
          created_at?: string | null
          description?: string | null
          duration_mins?: number | null
          id?: string
          is_active?: boolean | null
          is_approved?: boolean | null
          is_custom?: boolean | null
          name?: string
          provider_id?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_packages_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_packages_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string | null
          discount_rate: number | null
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
          discount_rate?: number | null
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
          discount_rate?: number | null
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
            referencedRelation: "provider_profiles"
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
      users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          email_verified: boolean | null
          full_name: string | null
          id: string
          is_verified: boolean | null
          phone: string | null
          phone_verified: boolean | null
          role: string
          stripe_customer_id: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          email_verified?: boolean | null
          full_name?: string | null
          id?: string
          is_verified?: boolean | null
          phone?: string | null
          phone_verified?: boolean | null
          role?: string
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          email_verified?: boolean | null
          full_name?: string | null
          id?: string
          is_verified?: boolean | null
          phone?: string | null
          phone_verified?: boolean | null
          role?: string
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          is_primary: boolean | null
          license_plate: string | null
          make: string
          model: string
          trim: string | null
          user_id: string | null
          vin: string | null
          year: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          license_plate?: string | null
          make: string
          model: string
          trim?: string | null
          user_id?: string | null
          vin?: string | null
          year: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          license_plate?: string | null
          make?: string
          model?: string
          trim?: string | null
          user_id?: string | null
          vin?: string | null
          year?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
