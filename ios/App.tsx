import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors } from './src/utils/colors';

import DashboardScreen from './src/screens/DashboardScreen';
import WeightHistoryScreen from './src/screens/WeightHistoryScreen';
import CaloriesHistoryScreen from './src/screens/CaloriesHistoryScreen';
import WhoopHistoryScreen from './src/screens/WhoopHistoryScreen';
import NutritionScreen from './src/screens/NutritionScreen';
import WorkoutsScreen from './src/screens/WorkoutsScreen';
import ChatScreen from './src/screens/ChatScreen';

const Tab = createBottomTabNavigator();
const DashStack = createNativeStackNavigator();

function DashboardStack() {
  return (
    <DashStack.Navigator screenOptions={{ headerShown: false }}>
      <DashStack.Screen name="DashboardMain" component={DashboardScreen} />
      <DashStack.Screen name="WeightHistory" component={WeightHistoryScreen} />
      <DashStack.Screen name="CaloriesHistory" component={CaloriesHistoryScreen} />
      <DashStack.Screen name="WhoopHistory" component={WhoopHistoryScreen} />
    </DashStack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer>
        <Tab.Navigator screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.brand[500],
          tabBarInactiveTintColor: colors.gray[400],
          tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.gray[200] },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        }}>
          <Tab.Screen name="Dashboard" component={DashboardStack}
            options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>📊</Text> }} />
          <Tab.Screen name="Nutrition" component={NutritionScreen}
            options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>🥗</Text> }} />
          <Tab.Screen name="Workouts" component={WorkoutsScreen}
            options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>🏋️</Text> }} />
          <Tab.Screen name="Chat" component={ChatScreen}
            options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>💬</Text> }} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
