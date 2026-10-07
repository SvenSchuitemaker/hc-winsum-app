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

    async function loadProfileRole(userId: string | undefined) {
        if (!supabase || !userId) {
            setRole(null);
            return;
        }

        const { data, error } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", userId)
            .single();

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

        async function init() {
            const {
                data: { session },
            } = await supabase.auth.getSession();

            if (!mounted) return;

            setSession(session);
            setUser(session?.user ?? null);
            await loadProfileRole(session?.user?.id);

            if (mounted) {
                setLoading(false);
            }
        }

        init();

        const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (!mounted) return;

            setSession(session);
            setUser(session?.user ?? null);
            await loadProfileRole(session?.user?.id);

            if (mounted) {
                setLoading(false);
            }
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
