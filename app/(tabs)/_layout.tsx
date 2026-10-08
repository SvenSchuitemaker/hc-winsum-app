import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { useWindowDimensions } from "react-native";
import { COLORS } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";

export default function TabsLayout() {
    const { role } = useAuth();
    const { width } = useWindowDimensions();

    const isAdmin = role === "super_admin";
    const isCompact = width <= 390;

    return (
        <Tabs
            screenOptions={{
                headerStyle: { backgroundColor: COLORS.background },
                headerTintColor: COLORS.text,
                headerTitleStyle: { color: COLORS.text, fontWeight: "800" },
                tabBarStyle: {
                    backgroundColor: COLORS.surface,
                    borderTopColor: COLORS.border,
                    height: isCompact ? 58 : undefined,
                },
                tabBarLabelStyle: {
                    fontSize: isCompact ? 9 : 11,
                    lineHeight: isCompact ? 11 : 13,
                },
                tabBarItemStyle: {
                    paddingHorizontal: isCompact ? 0 : 2,
                },
                tabBarIconStyle: {
                    marginTop: isCompact ? 2 : 0,
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
                        <Ionicons
                            name="home-outline"
                            size={isCompact ? Math.min(size, 20) : size}
                            color={color}
                        />
                    ),
                }}
            />

            <Tabs.Screen
                name="planning"
                options={{
                    title: "Planning",
                    tabBarLabel: "Planning",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons
                            name="calendar-outline"
                            size={isCompact ? Math.min(size, 20) : size}
                            color={color}
                        />
                    ),
                }}
            />

            <Tabs.Screen
                name="training-maken"
                options={{
                    title: "Trainingen",
                    tabBarLabel: isCompact ? "Training" : "Trainingen",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons
                            name="clipboard-outline"
                            size={isCompact ? Math.min(size, 20) : size}
                            color={color}
                        />
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
                        <Ionicons
                            name="add-outline"
                            size={isCompact ? Math.min(size, 20) : size}
                            color={color}
                        />
                    ),
                }}
            />

            <Tabs.Screen
                name="favorieten"
                options={{
                    title: "Favorieten",
                    tabBarLabel: isCompact ? "Favoriet" : "Favorieten",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons
                            name="heart-outline"
                            size={isCompact ? Math.min(size, 20) : size}
                            color={color}
                        />
                    ),
                }}
            />

            <Tabs.Screen
                name="profile"
                options={{
                    title: "Profile",
                    tabBarLabel: "Profile",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons
                            name="person-outline"
                            size={isCompact ? Math.min(size, 20) : size}
                            color={color}
                        />
                    ),
                }}
            />

            <Tabs.Screen
                name="teams"
                options={{
                    title: "Teams",
                    tabBarLabel: "Teams",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons
                            name="build-outline"
                            size={isCompact ? Math.min(size, 20) : size}
                            color={color}
                        />
                    ),
                }}
            />

            <Tabs.Screen
                name="dashboard"
                options={{
                    title: "Dashboard",
                    href: null,
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
