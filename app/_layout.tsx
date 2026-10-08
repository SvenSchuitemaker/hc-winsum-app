import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, router } from "expo-router";
import { Pressable } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "../constants/theme";
import { AuthProvider } from "../context/AuthContext";

function BackButton() {
    function handleBack() {
        if (router.canGoBack()) {
            router.back();
        } else {
            router.replace("/");
        }
    }

    return (
        <Pressable
            onPress={handleBack}
            hitSlop={12}
            style={{ paddingHorizontal: 4, paddingVertical: 6 }}
        >
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </Pressable>
    );
}

const withBack = (title: string) => ({
    title,
    headerBackVisible: false,
    headerLeft: () => <BackButton />,
});

export default function RootLayout() {
    return (
        <AuthProvider>
            <SafeAreaProvider>
                <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
                    <StatusBar style="light" />
                    <Stack
                        screenOptions={{
                            headerStyle: {
                                backgroundColor: COLORS.background,
                            },
                            headerTintColor: COLORS.text,
                            headerTitleStyle: {
                                color: COLORS.text,
                                fontWeight: "800",
                            },
                            headerShadowVisible: false,
                            contentStyle: {
                                backgroundColor: COLORS.background,
                                paddingTop: 5,
                            },
                        }}
                    >
                        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                        <Stack.Screen name="login" options={withBack("Inloggen")} />
                        <Stack.Screen name="register" options={withBack("Account aanmaken")} />
                        <Stack.Screen name="category/[slug]" options={withBack("Categorie")} />
                        <Stack.Screen name="exercise/[id]" options={withBack("Oefening")} />
                        <Stack.Screen name="training-nieuw" options={withBack("Nieuwe training")} />
                        <Stack.Screen name="training/[id]" options={withBack("Training")} />
                        <Stack.Screen name="training-bewerk/[id]" options={withBack("Training bewerken")} />
                        <Stack.Screen name="exercise-bewerk/[id]" options={withBack("Oefening bewerken")} />
                        <Stack.Screen name="dashboard" options={withBack("Dashboard")} />
                    </Stack>
                </SafeAreaView>
            </SafeAreaProvider>
        </AuthProvider>
    );
}
