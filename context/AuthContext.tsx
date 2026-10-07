import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type UserRole = "super_admin" | "head_trainer" | "trainer" | null;

type AuthContextType = {
    user: User | null;
    session: Session | null;
    loading: boolean;
    role: UserRole;
};

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    loading: true,
    role: null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [role, setRole] = useState<UserRole>(null);
    const [loading, setLoading] = useState(true);

    async function syncClubFromMetadata(currentUser: User | undefined) {
        if (!supabase || !currentUser) return;

        const rawClubId = currentUser.user_metadata?.club_id;
        const clubId = typeof rawClubId === "number" ? rawClubId : Number(rawClubId);

        if (!Number.isFinite(clubId) || clubId <= 0) return;

        const { data: profile } = await supabase
            .from("profiles")
            .select("club_id")
            .eq("id", currentUser.id)
            .maybeSingle();

        if (profile && !profile.club_id) {
            await supabase
                .from("profiles")
                .update({ club_id: clubId })
                .eq("id", currentUser.id);
        }
    }

    async function loadProfileRole(currentUser: User | undefined) {
        if (!supabase || !currentUser) {
            setRole(null);
            return;
        }

        await syncClubFromMetadata(currentUser);

        const { data, error } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", currentUser.id)
            .maybeSingle();

        if (error) {
            setRole(null);
            return;
        }

        setRole((data?.role as UserRole) ?? null);
    }

    useEffect(() => {
        let mounted = true;

        if (!supabase) {
            setLoading(false);

            return () => {
                mounted = false;
            };
        }

        async function applySession(nextSession: Session | null) {
            if (!mounted) return;

            setSession(nextSession);
            setUser(nextSession?.user ?? null);
            await loadProfileRole(nextSession?.user);

            if (mounted) {
                setLoading(false);
            }
        }

        async function init() {
            const {
                data: { session: initialSession },
            } = await supabase.auth.getSession();

            await applySession(initialSession);
        }

        init();

        const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
            await applySession(nextSession);
        });

        return () => {
            mounted = false;
            listener.subscription.unsubscribe();
        };
    }, []);

    const value = useMemo(
        () => ({
            user,
            session,
            loading,
            role,
        }),
        [user, session, loading, role]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    return useContext(AuthContext);
}
