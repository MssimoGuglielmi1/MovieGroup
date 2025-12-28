//WidgetListaStaffAttivoAdmin.js
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, StatusBar, Linking, Platform, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';

const Colors = {
    background: '#000000', surface: '#1C1C1E', primary: '#4CAF50', 
    textMain: '#FFFFFF', textSub: '#8E8E93', border: '#2C2C2E',
    accent: '#0A84FF'
};

export default function WidgetListaStaffAttivoAdmin({ navigation, route }) {
    // Riceviamo la lista dallo "zaino" della navigazione
    const { staffData } = route.params || { staffData: [] };

    // Funzione per chiamare
    const handleCallCollaborator = async (phoneNumber) => {
        if (!phoneNumber || phoneNumber.length < 5) {
            Alert.alert("Nessun Numero", "Questo collaboratore non ha inserito un cellulare.");
            return;
        }
        const cleanNumber = `tel:${phoneNumber.replace(/\s/g, '')}`;
        Linking.openURL(cleanNumber);
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
            
            {/* Header Semplice */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Feather name="arrow-left" size={24} color={Colors.textMain} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>RUBRICA STAFF ({staffData.length})</Text>
                <View style={{width: 24}} /> 
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {staffData.length === 0 ? (
                    <Text style={styles.emptyText}>Nessun collaboratore attivo.</Text>
                ) : (
                    // LA TUA LOGICA PULITA 👇
                    staffData.map(user => (
                      <View key={user.id} style={styles.cardItem}>
                        <View style={{flex: 1}}>
                            <Text style={styles.cardTitle}>{user.firstName} {user.lastName}</Text>
                            <Text style={styles.cardSubtitle}>{user.email}</Text>
                            {user.phoneNumber ? 
                                <Text style={{fontSize:10, color:Colors.primary, marginTop:4}}>📞 {user.phoneNumber}</Text> : 
                                <Text style={{fontSize:10, color:Colors.textSub, marginTop:4, fontStyle:'italic'}}>Nessun numero</Text>
                            }
                        </View>
                        
                        <TouchableOpacity 
                            onPress={() => handleCallCollaborator(user.phoneNumber)}
                            style={[
                                styles.actionBtn, 
                                { backgroundColor: user.phoneNumber ? Colors.primary+'20' : Colors.border, borderWidth:1, borderColor: user.phoneNumber ? Colors.primary : Colors.border }
                            ]}
                        >
                            <Feather name="phone" size={20} color={user.phoneNumber ? Colors.primary : Colors.textSub} />
                        </TouchableOpacity>
                      </View>
                    ))
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: Colors.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
    headerTitle: { fontSize: 18, fontWeight: '900', color: Colors.textMain, letterSpacing: 1 },
    content: { padding: 20 },
    emptyText: { color: Colors.textSub, textAlign: 'center', marginTop: 50, fontStyle: 'italic' },
    cardItem: { backgroundColor: Colors.surface, borderRadius: 12, padding: 15, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border },
    cardTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textMain },
    cardSubtitle: { fontSize: 12, color: Colors.textSub, marginTop: 2 },
    actionBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }
});
