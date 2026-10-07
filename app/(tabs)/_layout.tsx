import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { COLORS } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";

export default function TabsLayout() {
    const { role } = useAuth();
    const isAdmin = role === "super_admin";

    return (
        <Tabs
            screenOptions={{
                headerStyle: { backgroundColor: COLORS.background },
                headerTintColor: COLORS.text,
                headerTitleStyle: { color: COLORS.text, fontWeight: "800" },
                tabBarStyle: {
                    backgroundColor: COLORS.surface,
                    borderTopColor: COLORS.border,
                },
                tabBarActiveTintColor: COLORS.primaryLight,
                tabBarInactiveTintColor: COLORS.mutedText,
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: "Home",
                    tabBarLabel: "Home",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="home-outline" size={size} color={color} />
                    ),
                }}
            />

            <Tabs.Screen
                name="planning"
                options={{
                    title: "Planning",
                    tabBarLabel: "Planning",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="calendar-outline" size={size} color={color} />
                    ),
                }}
            />

            <Tabs.Screen
                name="training-maken"
                options={{
                    title: "Trainingen",
                    tabBarLabel: "Trainingen",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="clipboard-outline" size={size} color={color} />
                    ),
                }}
            />

            <Tabs.Screen
                name="nieuwe-oefeningen"
                options={{
                    title: "Nieuwe oefening",
                    tabBarLabel: "Nieuwe",
                    href: isAdmin ? undefined : null,
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="add-outline" size={size} color={color} />
                    ),
                }}
            />

            <Tabs.Screen
                name="favorieten"
                options={{
                    title: "Favorieten",
                    tabBarLabel: "Favorieten",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="heart-outline" size={size} color={color} />
                    ),
                }}
            />

            <Tabs.Screen
                name="profile"
                options={{
                    title: "Profile",
                    tabBarLabel: "Profile",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="person-outline" size={size} color={color} />
                    ),
                }}
            />

            <Tabs.Screen
                name="teams"
                options={{
                    title: "Teams",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="build-outline" size={size} color={color} />
                    ),
                }}
            />

            <Tabs.Screen
                name="team-trainers"
                options={{
                    href: null,
                }}
            />
        </Tabs>
    );
}