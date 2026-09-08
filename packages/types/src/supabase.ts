export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      ejercicios: {
        Row: {
          actualizado: string
          carga: string
          coach_id: string | null
          creado: string
          id: string
          nombre: string
          video: string | null
        }
        Insert: {
          actualizado?: string
          carga?: string
          coach_id?: string | null
          creado?: string
          id?: string
          nombre: string
          video?: string | null
        }
        Update: {
          actualizado?: string
          carga?: string
          coach_id?: string | null
          creado?: string
          id?: string
          nombre?: string
          video?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ejercicios_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "alumnos_archivados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ejercicios_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles: {
        Row: {
          actualizado: string
          archivado_en: string | null
          coach_id: string | null
          codigo_acceso: string | null
          creado: string
          id: string
          nombre: string
          rol: string
          telefono: string | null
        }
        Insert: {
          actualizado?: string
          archivado_en?: string | null
          coach_id?: string | null
          codigo_acceso?: string | null
          creado?: string
          id: string
          nombre: string
          rol?: string
          telefono?: string | null
        }
        Update: {
          actualizado?: string
          archivado_en?: string | null
          coach_id?: string | null
          codigo_acceso?: string | null
          creado?: string
          id?: string
          nombre?: string
          rol?: string
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "perfiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "alumnos_archivados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_series: {
        Row: {
          bloque: number
          dia: number
          ejercicio: number
          plan_id: string
          semana: number
          series: number
        }
        Insert: {
          bloque: number
          dia: number
          ejercicio: number
          plan_id: string
          semana: number
          series: number
        }
        Update: {
          bloque?: number
          dia?: number
          ejercicio?: number
          plan_id?: string
          semana?: number
          series?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_series_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes"
            referencedColumns: ["id"]
          },
        ]
      }
      planes: {
        Row: {
          actualizado: string
          alumno_id: string
          ciclo_carga: Json
          coach_id: string
          creado: string
          estado: string
          estructura: Json
          id: string
          origen: string | null
          semanas: number
          titulo: string
        }
        Insert: {
          actualizado?: string
          alumno_id: string
          ciclo_carga?: Json
          coach_id: string
          creado?: string
          estado?: string
          estructura?: Json
          id?: string
          origen?: string | null
          semanas?: number
          titulo: string
        }
        Update: {
          actualizado?: string
          alumno_id?: string
          ciclo_carga?: Json
          coach_id?: string
          creado?: string
          estado?: string
          estructura?: Json
          id?: string
          origen?: string | null
          semanas?: number
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "planes_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos_archivados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planes_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "alumnos_archivados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      registros: {
        Row: {
          actualizado: string
          alumno_id: string
          bloque: number
          carga: string | null
          dia: number
          ejercicio: number
          hecha: boolean
          heredada: boolean
          id: string
          plan_id: string
          reps: string | null
          semana: number
          serie: number
        }
        Insert: {
          actualizado?: string
          alumno_id: string
          bloque: number
          carga?: string | null
          dia: number
          ejercicio: number
          hecha?: boolean
          heredada?: boolean
          id?: string
          plan_id: string
          reps?: string | null
          semana: number
          serie: number
        }
        Update: {
          actualizado?: string
          alumno_id?: string
          bloque?: number
          carga?: string | null
          dia?: number
          ejercicio?: number
          hecha?: boolean
          heredada?: boolean
          id?: string
          plan_id?: string
          reps?: string | null
          semana?: number
          serie?: number
        }
        Relationships: [
          {
            foreignKeyName: "registros_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos_archivados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      alumnos_archivados: {
        Row: {
          archivado_en: string | null
          coach_id: string | null
          creado: string | null
          id: string | null
          nombre: string | null
          planes: number | null
          registros: number | null
          rol: string | null
          telefono: string | null
        }
        Insert: {
          archivado_en?: string | null
          coach_id?: string | null
          creado?: string | null
          id?: string | null
          nombre?: string | null
          planes?: never
          registros?: never
          rol?: string | null
          telefono?: string | null
        }
        Update: {
          archivado_en?: string | null
          coach_id?: string | null
          creado?: string | null
          id?: string | null
          nombre?: string | null
          planes?: never
          registros?: never
          rol?: string | null
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "perfiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "alumnos_archivados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      es_coach_de: { Args: { alumno: string }; Returns: boolean }
      mi_coach: { Args: never; Returns: string }
      promover_a_coach: { Args: { usuario: string }; Returns: undefined }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

