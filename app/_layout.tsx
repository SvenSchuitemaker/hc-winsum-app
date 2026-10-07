import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "../constants/theme";
import { AuthProvider } from "../context/AuthContext";

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
                        <Stack.Screen name="login" options={{ title: "Inloggen" }} />
                        <Stack.Screen name="register" options={{ title: "Account aanmaken" }} />
                        <Stack.Screen name="category/[slug]" options={{ title: "Categorie" }} />
                        <Stack.Screen name="exercise/[id]" options={{ title: "Oefening" }} />
                        <Stack.Screen name="training-nieuw" options={{ title: "Nieuwe training" }} />
                        <Stack.Screen name="training/[id]" options={{ title: "Training" }} />
                        <Stack.Screen name="training-bewerk/[id]" options={{ title: "Training bewerken" }} />
                        <Stack.Screen name="exercise-bewerk/[id]" options={{ title: "Oefening bewerken" }} />
                    </Stack>
                </SafeAreaView>
            </SafeAreaProvider>
        </AuthProvider>
    );
}