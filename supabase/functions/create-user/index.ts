// ==============================================================================
// Supabase Edge Function: create-user (Module 1 - User Provisioning)
// Target Runtime: Deno / Supabase Edge Functions
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CreateUserPayload {
  full_name: string;
  email: string;
  badge_number: string;
  phone?: string;
  department: string;
  role_id?: string;
  role_code?: string;
  status?: "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
  temporary_password?: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "SERVER_CONFIG_ERROR",
            message: "Missing backend configuration credentials.",
          },
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Authenticate caller using their Bearer token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Missing Authorization header in request.",
          },
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client as caller to verify caller JWT
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user: callerUser }, error: callerAuthError } = await callerClient.auth.getUser();
    if (callerAuthError || !callerUser) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid or expired session token.",
          },
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Service role client for privileged operations
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 2. Validate caller permissions via database
    const { data: callerProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, email, role_id, status, roles(id, code, name)")
      .eq("id", callerUser.id)
      .single();

    if (profileError || !callerProfile || callerProfile.status !== "ACTIVE") {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Caller profile is not active or could not be found.",
          },
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerRoleCode = (callerProfile.roles as any)?.code;
    const isAuthorized = callerRoleCode === "super_admin" || callerRoleCode === "admin";

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "INSUFFICIENT_PERMISSIONS",
            message: "Only Administrators and Super Administrators can provision user accounts.",
          },
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Parse and validate request body
    const body: CreateUserPayload = await req.json();
    const {
      full_name,
      email,
      badge_number,
      phone,
      department,
      role_id,
      role_code,
      status = "ACTIVE",
      temporary_password,
    } = body;

    if (!full_name || !email || !badge_number || !department) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "VALIDATION_FAILED",
            message: "Missing mandatory fields (full_name, email, badge_number, department).",
          },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "INVALID_EMAIL",
            message: "Please provide a valid official email address.",
          },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve role_id
    let targetRoleId = role_id;
    let targetRoleCode = role_code;

    if (!targetRoleId && targetRoleCode) {
      const { data: roleRow, error: roleLookupError } = await adminClient
        .from("roles")
        .select("id, code, name")
        .eq("code", targetRoleCode)
        .single();

      if (roleLookupError || !roleRow) {
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: "INVALID_ROLE",
              message: `Role code '${targetRoleCode}' does not exist in system registry.`,
            },
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      targetRoleId = roleRow.id;
    } else if (targetRoleId) {
      const { data: roleRow, error: roleLookupError } = await adminClient
        .from("roles")
        .select("id, code, name")
        .eq("id", targetRoleId)
        .single();

      if (roleLookupError || !roleRow) {
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: "INVALID_ROLE",
              message: "Provided role ID does not exist.",
            },
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      targetRoleCode = roleRow.code;
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "MISSING_ROLE",
            message: "A designated role must be selected.",
          },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check duplicate badge number
    const { data: existingBadge } = await adminClient
      .from("profiles")
      .select("id")
      .eq("badge_number", badge_number)
      .maybeSingle();

    if (existingBadge) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "DUPLICATE_BADGE_NUMBER",
            message: `Badge number '${badge_number}' is already assigned to another user.`,
          },
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate random secure temporary password if not provided
    const tempPassword = temporary_password || generateSecureTemporaryPassword();

    // 4. Create user in Supabase Auth via adminClient
    const { data: authUser, error: authCreateError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name,
        badge_number,
        role_code: targetRoleCode,
      },
    });

    if (authCreateError || !authUser.user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: authCreateError?.message?.includes("already registered") ? "DUPLICATE_EMAIL" : "AUTH_CREATION_FAILED",
            message: authCreateError?.message || "Failed to create authentication credentials.",
          },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newUserId = authUser.user.id;

    // 5. Create corresponding profile record with must_change_password = true
    const { data: newProfile, error: profileInsertError } = await adminClient
      .from("profiles")
      .insert({
        id: newUserId,
        email,
        full_name,
        role_id: targetRoleId,
        badge_number,
        phone: phone || null,
        department,
        status,
        must_change_password: true,
        created_by: callerUser.id,
        updated_by: callerUser.id,
      })
      .select("id, email, full_name, role_id, badge_number, phone, department, status, must_change_password, created_at")
      .single();

    if (profileInsertError) {
      // Rollback auth user creation if profile insert failed
      await adminClient.auth.admin.deleteUser(newUserId);
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "PROFILE_CREATION_FAILED",
            message: profileInsertError.message,
          },
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Record immutable audit log
    await adminClient.from("audit_logs").insert({
      actor_id: callerUser.id,
      actor_email: callerProfile.email,
      actor_role: callerRoleCode,
      action: "USER_CREATED",
      entity_name: "profiles",
      entity_id: newUserId,
      old_values: null,
      new_values: {
        id: newUserId,
        email,
        full_name,
        badge_number,
        department,
        role_code: targetRoleCode,
        status,
        must_change_password: true,
      },
      ip_address: req.headers.get("x-forwarded-for") || "unknown",
      user_agent: req.headers.get("user-agent") || "unknown",
    });

    // 7. Return safe payload (without service role secrets)
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          user: newProfile,
          role_code: targetRoleCode,
          temporary_password_issued: true,
          message: `User ${full_name} successfully provisioned with mandatory first-time password reset.`,
        },
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: err.message || "An unexpected error occurred during user provisioning.",
        },
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generateSecureTemporaryPassword(): string {
  const charsUpper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const charsLower = "abcdefghjkmnpqrstuvwxyz";
  const charsNums = "23456789";
  const charsSpecial = "@#$%&*";
  
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  
  // Guarantee strong compliance (upper, lower, digit, special, 12 chars)
  let pwd = pick(charsUpper) + pick(charsLower) + pick(charsNums) + pick(charsSpecial);
  const allChars = charsUpper + charsLower + charsNums + charsSpecial;
  for (let i = 0; i < 8; i++) {
    pwd += pick(allChars);
  }
  return pwd;
}
