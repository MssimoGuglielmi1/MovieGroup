//PDFDelFounder.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, Platform, StatusBar, ActivityIndicator, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { db } from './firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { generatePDF } from './CreatorePDF';
import { Picker } from '@react-native-picker/picker';

const Colors = {
    background: '#0D1117', surface: '#161B22', textPrimary: '#F0F6FC', textSecondary: '#8B949E',
    accentCyan: '#00D1FF', accentGreen: '#238636', accentRed: '#DA3633', accentPurple: '#A371F7', divider: '#30363D'
};

export default function PDFDelFounder({ navigation }) {
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingData, setLoadingData] = useState(true);

    useEffect(() => {
        const fetchStaff = async () => {
            try {
                const q = query(collection(db, "users"), where("isApproved", "==", true));
                const snapshot = await getDocs(q);
                const staffList = snapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() }))
                    .filter(u => u.role !== 'FOUNDER') 
                    .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
                setUsers(staffList);
            } catch (e) { console.error("Errore staff", e); } 
            finally { setLoadingData(false); }
        };
        fetchStaff();
    }, []);

    const downloadIndividualReport = async () => {
        if (!selectedUser) { Alert.alert("Attenzione", "Seleziona una persona dal menu."); return; }
        setLoading(true);
        try {
            const userObj = users.find(u => u.id === selectedUser);
            const userName = userObj ? `${userObj.firstName} ${userObj.lastName}` : "Utente";
            const today = new Date();
            const pastDate = new Date();
            pastDate.setDate(today.getDate() - 60);
            const pastDateStr = pastDate.toISOString().split('T')[0];

            const q = query(
                collection(db, "shifts"),
                where("collaboratorId", "==", selectedUser),
                where("status", "==", "completato"),
                where("date", ">=", pastDateStr)
            );

            const snapshot = await getDocs(q);
            const shifts = snapshot.docs.map(doc => doc.data());
            shifts.sort((a, b) => new Date(b.date) - new Date(a.date));

            if (shifts.length === 0) { Alert.alert("Vuoto", `Nessun turno completato per ${userName}.`); setLoading(false); return; }

            await generatePDF(`REPORT INDIVIDUALE: ${userName.toUpperCase()}`, shifts, true);
        } catch (e) { Alert.alert("Errore", e.message); } 
        finally { setLoading(false); }
    };

    const downloadFullStaffReport = async () => {
        setLoading(true);
        try {
            const today = new Date();
            const pastDate = new Date();
            pastDate.setDate(today.getDate() - 60); 
            const pastDateStr = pastDate.toISOString().split('T')[0];

            const q = query(collection(db, "shifts"), where("status", "==", "completato"), where("date", ">=", pastDateStr));
            const snapshot = await getDocs(q);
            const shifts = snapshot.docs.map(doc => doc.data());
            shifts.sort((a, b) => new Date(b.date) - new Date(a.date));

            if (shifts.length === 0) { Alert.alert("Vuoto", "Nessun turno trovato nell'ultimo mese."); setLoading(false); return; }

            await generatePDF("REPORT COMPLETO (TUTTO LO STAFF)", shifts, true);
        } catch (e) { Alert.alert("Errore", e.message); } 
        finally { setLoading(false); }
    };

    const downloadAssignmentLog = async () => {
        setLoading(true);
        try {
            const today = new Date();
            const pastDate = new Date();
            pastDate.setDate(today.getDate() - 60);
            const pastDateStr = pastDate.toISOString().split('T')[0];

            const q = query(collection(db, "shifts"), where("date", ">=", pastDateStr));
            const snapshot = await getDocs(q);
            const auditData = snapshot.docs.map(doc => {
                const d = doc.data();
                return {
                    ...d,
                    collaboratorName: d.collaboratorName, 
                    location: `Assegnato da: ${d.creatorName || 'Sconosciuto'}`,
                    payoutRate: d.status.toUpperCase(), 
                    realCost: "---" 
                };
            });
            auditData.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));

            if (auditData.length === 0) { Alert.alert("Vuoto", "Nessuna assegnazione recente."); setLoading(false); return; }

            await generatePDF("REGISTRO ASSEGNAZIONI (AUDIT)", auditData, false); 
        } catch (e) { Alert.alert("Errore", e.message); } 
        finally { setLoading(false); }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{padding:10}}>
                    <Feather name="arrow-left" size={24} color="#FFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>PDF DEL FOUNDER 🖨️</Text>
                <View style={{width:40}}/>
            </View>

            <ScrollView contentContainerStyle={{padding: 20}}>
                {/* 1. REPORT INDIVIDUALE */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Feather name="user" size={24} color={Colors.accentCyan} />
                        <Text style={styles.cardTitle}>REPORT SINGOLO</Text>
                    </View>
                    <Text style={styles.cardDesc}>Seleziona un Admin o un Collaboratore per il suo storico personale.</Text>
                    <View style={styles.pickerContainer}>
                        {loadingData ? <ActivityIndicator color={Colors.accentCyan} /> : (
                            <Picker 
                                selectedValue={selectedUser} 
                                onValueChange={(v) => setSelectedUser(v)} 
                                dropdownIconColor="#FFF" 
                                style={{color:'#FFF'}}
                                itemStyle={{ color: '#FFFFFF' }} // <-- FIX IPHONE (Menu bianco)
                            >
                                <Picker.Item label="Seleziona Staff..." value="" color="#999"/>
                                {users.map(u => (
                                    <Picker.Item 
                                        key={u.id} 
                                        label={`${u.lastName} ${u.firstName} (${u.role})`} 
                                        value={u.id} 
                                        // Fix colori Android/iOS
                                        color={Platform.OS === 'ios' ? '#FFFFFF' : '#000000'} 
                                    />
                                ))}
                            </Picker>
                        )}
                    </View>
                    <TouchableOpacity style={[styles.btn, {backgroundColor: Colors.accentCyan}]} onPress={downloadIndividualReport} disabled={loading || !selectedUser}>
                        {loading ? <ActivityIndicator color="#000"/> : <Text style={styles.btnText}>SCARICA PDF PERSONALE</Text>}
                    </TouchableOpacity>
                </View>

                {/* 2. REPORT TOTALE */}
                <View style={[styles.card, {borderColor: Colors.accentGreen}]}>
                    <View style={styles.cardHeader}>
                        <Feather name="users" size={24} color={Colors.accentGreen} />
                        <Text style={[styles.cardTitle, {color: Colors.accentGreen}]}>REPORT TOTALE (TUTTI)</Text>
                    </View>
                    <Text style={styles.cardDesc}>Un unico documento con i turni di Admin 1, Admin 2, Colla 1 e Colla 2.</Text>
                    <TouchableOpacity style={[styles.btn, {backgroundColor: Colors.accentGreen}]} onPress={downloadFullStaffReport} disabled={loading}>
                        {loading ? <ActivityIndicator color="#FFF"/> : <Text style={[styles.btnText, {color:'#FFF'}]}>SCARICA PDF COMPLETO</Text>}
                    </TouchableOpacity>
                </View>

                {/* 3. AUDIT ASSEGNAZIONI */}
                <View style={[styles.card, {borderColor: Colors.accentPurple}]}>
                    <View style={styles.cardHeader}>
                        <Feather name="eye" size={24} color={Colors.accentPurple} />
                        <Text style={[styles.cardTitle, {color: Colors.accentPurple}]}>LOG ASSEGNAZIONI</Text>
                    </View>
                    <Text style={styles.cardDesc}>Verifica chi ha assegnato i turni, quando, e se sono stati accettati.</Text>
                    <TouchableOpacity style={[styles.btn, {backgroundColor: Colors.accentPurple}]} onPress={downloadAssignmentLog} disabled={loading}>
                        {loading ? <ActivityIndicator color="#FFF"/> : <Text style={[styles.btnText, {color:'#FFF'}]}>SCARICA LOG AUDIT</Text>}
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: Colors.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.divider },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFF', letterSpacing: 1 },
    card: { backgroundColor: Colors.surface, borderRadius: 16, padding: 20, marginBottom: 25, borderWidth: 1, borderColor: Colors.divider },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
    cardTitle: { fontSize: 16, fontWeight: 'bold', marginLeft: 10, letterSpacing:1 },
    cardDesc: { color: Colors.textSecondary, marginBottom: 20, lineHeight: 20, fontSize: 12 },
    pickerContainer: { borderWidth: 1, borderColor: Colors.divider, borderRadius: 10, marginBottom: 20, backgroundColor: '#0D1117' },
    btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12 },
    btnText: { fontWeight: 'bold', fontSize: 14, color: '#000' },
});
