import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
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
    const roleRequestId = useRef(0);

    async function loadProfileRole(userId: string | undefined) {
        const requestId = ++roleRequestId.current;

        if (!supabase || !userId) {
            setRole(null);
            return;
        }

        const { data, error } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", userId)
            .maybeSingle();

        if (requestId !== roleRequestId.current) return;

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

        const loadingFallback = setTimeout(() => {
            if (mounted) {
                setLoading(false);
            }
        }, 2500);

        async function init() {
            try {
                const {
                    data: { session: initialSession },
                } = await supabase.auth.getSession();

                if (!mounted) return;

                setSession(initialSession);
                setUser(initialSession?.user ?? null);
                setLoading(false);

                if (initialSession?.user?.id) {
                    void loadProfileRole(initialSession.user.id);
                } else {
                    setRole(null);
                }
            } catch {
                if (!mounted) return;

                setSession(null);
                setUser(null);
                setRole(null);
                setLoading(false);
            }
        }

        void init();

        const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            if (!mounted) return;

            setSession(nextSession);
            setUser(nextSession?.user ?? null);
            setLoading(false);

            const nextUserId = nextSession?.user?.id;

            setTimeout(() => {
                if (!mounted) return;

                if (nextUserId) {
                    void loadProfileRole(nextUserId);
                } else {
                    roleRequestId.current += 1;
                    setRole(null);
                }
            }, 0);
        });

        return () => {
            mounted = false;
            clearTimeout(loadingFallback);
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
