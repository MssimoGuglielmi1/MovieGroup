//PDFDelFounder.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, Platform, StatusBar, ActivityIndicator, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { db } from './firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { generatePDF } from './CreatorePDF';
import { Picker } from '@react-native-picker/picker';

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

const Colors = {
    background: '#0D1117', surface: '#161B22', textPrimary: '#F0F6FC', textSecondary: '#8B949E',
    accentCyan: '#00D1FF', accentGreen: '#238636', accentRed: '#DA3633', accentPurple: '#A371F7', divider: '#30363D', excelGreen: '#107C41'
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

// --- MOTORE EXCEL (.xlsx) - VERSIONE IBRIDA (WEB + APP) ---
    const generateExcel = async (title, data) => {
        try {
            // 1. Mappiamo i dati per Excel (Colonne pulite)
            const excelData = data.map(item => ({
                DATA: item.date || "---",
                LUOGO: item.location || "---",
                COLLABORATORE: item.collaboratorName || "N/D",
                RUOLO: item.collaboratorRole || "---",
                INIZIO: item.startTime || "---",
                FINE: item.endTime || "---",
                STATO: item.status ? item.status.toUpperCase() : "---",
                IMPORTO: item.payoutRate ? `€ ${item.payoutRate}` : "---",
                ASSEGNATO_DA: item.creatorName || "---"
            }));

            // 2. Creiamo il foglio
            const ws = XLSX.utils.json_to_sheet(excelData);

            // Larghezza colonne
            ws['!cols'] = [
                { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 15 },
                { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 20 }
            ];

            // 3. Creiamo il file (WorkBook)
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Report");

            // --- 4. BIVIO: WEB O TELEFONO? ---
            if (Platform.OS === 'web') {
                // --- VERSIONE WEB (PC) ---
                // Scrive e scarica direttamente il file nel browser
                XLSX.writeFile(wb, `${title}.xlsx`);
                // (Su web non serve alert, il download parte da solo)
            } else {
                // --- VERSIONE APP (IOS/ANDROID) ---
                const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
                const fileName = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.xlsx`;
                const uri = FileSystem.documentDirectory + fileName;

                await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });

                if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(uri);
                } else {
                    Alert.alert("Salvato", "File salvato nei documenti.");
                }
            }

        } catch (e) {
            console.error("Errore Excel:", e);
            if (Platform.OS === 'web') alert("Errore Excel: " + e.message);
            else Alert.alert("Errore Excel", e.message);
        }
    };
    
// --- FUNZIONE UNICA DI DOWNLOAD (PDF + EXCEL) ---
    const handleDownload = async (type, format) => {
        // Controlli preliminari
        if (type === 'INDIVIDUAL' && !selectedUser) { 
            Alert.alert("Attenzione", "Seleziona una persona dal menu."); 
            return; 
        }

        setLoading(true);
        try {
            const today = new Date();
            const pastDate = new Date();
            pastDate.setDate(today.getDate() - 60);
            const pastDateStr = pastDate.toISOString().split('T')[0];

            let q;
            let title = "";
            
            // A. COSTRUIAMO LA QUERY IN BASE AL TIPO
            if (type === 'INDIVIDUAL') {
                const userObj = users.find(u => u.id === selectedUser);
                const userName = userObj ? `${userObj.firstName} ${userObj.lastName}` : "Utente";
                title = `REPORT_${userName.toUpperCase()}`;
                
                q = query(
                    collection(db, "shifts"),
                    where("collaboratorId", "==", selectedUser),
                    where("status", "==", "completato"),
                    where("date", ">=", pastDateStr)
                );
            } 
            else if (type === 'FULL') {
                title = "REPORT_STAFF_COMPLETO";
                q = query(
                    collection(db, "shifts"), 
                    where("status", "==", "completato"), 
                    where("date", ">=", pastDateStr)
                );
            } 
            else if (type === 'AUDIT') {
                title = "AUDIT_ASSEGNAZIONI";
                q = query(
                    collection(db, "shifts"), 
                    where("date", ">=", pastDateStr)
                );
            }

            // B. SCARICHIAMO I DATI
            const snapshot = await getDocs(q);
            let finalData = snapshot.docs.map(doc => doc.data());

            // C. ORDINAMENTO (Dal più recente)
            finalData.sort((a, b) => new Date(b.date) - new Date(a.date));

            if (finalData.length === 0) { 
                Alert.alert("Vuoto", "Nessun dato trovato per il periodo selezionato."); 
                setLoading(false); 
                return; 
            }

            // D. BIVIO: PDF O EXCEL?
            if (format === 'PDF') {
                // Per il PDF serve un titolo "umano"
                const humanTitle = title.replace(/_/g, ' '); 
                // Audit usa un layout leggermente diverso (false come terzo parametro se vuoi)
                await generatePDF(humanTitle, finalData, type !== 'AUDIT'); 
            } else {
                // Excel
                await generateExcel(title, finalData);
            }

        } catch (e) {
            Alert.alert("Errore", e.message);
        } finally {
            setLoading(false);
        }
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
                                itemStyle={{ color: '#FFFFFF' }}
                            >
                                <Picker.Item label="Seleziona Staff..." value="" color="#999"/>
                                {users.map(u => (
                                    <Picker.Item 
                                        key={u.id} 
                                        label={`${u.lastName} ${u.firstName} (${u.role})`} 
                                        value={u.id} 
                                        color={Platform.OS === 'ios' ? '#FFFFFF' : '#000000'} 
                                    />
                                ))}
                            </Picker>
                        )}
                    </View>

                        {/* BOTTONI REPORT SINGOLO */}
                    <View style={{flexDirection:'row', gap:10}}>
                        {/* PDF -> AZZURRO */}
                        <TouchableOpacity style={[styles.btn, {backgroundColor: Colors.accentCyan, flex:1}]} onPress={() => handleDownload('INDIVIDUAL', 'PDF')} disabled={loading || !selectedUser}>
                            {loading ? <ActivityIndicator color="#000"/> : <Text style={styles.btnText}>📄 PDF</Text>}
                        </TouchableOpacity>
                        
                        {/* EXCEL -> VERDE NUOVO */}
                        <TouchableOpacity style={[styles.btn, {backgroundColor: Colors.excelGreen, flex:1}]} onPress={() => handleDownload('INDIVIDUAL', 'EXCEL')} disabled={loading || !selectedUser}>
                            <Text style={[styles.btnText, {color:'#FFF'}]}>📊 EXCEL</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* 2. REPORT TOTALE */}
                <View style={[styles.card, {borderColor: Colors.accentGreen}]}>
                    <View style={styles.cardHeader}>
                        <Feather name="users" size={24} color={Colors.accentGreen} />
                        <Text style={[styles.cardTitle, {color: Colors.accentGreen}]}>REPORT TOTALE (TUTTI)</Text>
                    </View>
                    <Text style={styles.cardDesc}>Un unico documento con i turni di tutto lo staff completati negli ultimi 60 giorni.</Text>
                    
                {/* BOTTONI REPORT TOTALE */}
                    <View style={{flexDirection:'row', gap:10}}>
                        {/* PDF -> AZZURRO (Uniformato) */}
                        <TouchableOpacity style={[styles.btn, {backgroundColor: Colors.accentCyan, flex:1}]} onPress={() => handleDownload('FULL', 'PDF')} disabled={loading}>
                            {loading ? <ActivityIndicator color="#FFF"/> : <Text style={[styles.btnText, {color:'#000'}]}>📄 PDF</Text>}
                        </TouchableOpacity>

                        {/* EXCEL -> VERDE NUOVO */}
                        <TouchableOpacity style={[styles.btn, {backgroundColor: Colors.excelGreen, flex:1}]} onPress={() => handleDownload('FULL', 'EXCEL')} disabled={loading}>
                            <Text style={[styles.btnText, {color:'#FFF'}]}>📊 EXCEL</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* 3. AUDIT ASSEGNAZIONI */}
                <View style={[styles.card, {borderColor: Colors.accentPurple}]}>
                    <View style={styles.cardHeader}>
                        <Feather name="eye" size={24} color={Colors.accentPurple} />
                        <Text style={[styles.cardTitle, {color: Colors.accentPurple}]}>LOG ASSEGNAZIONI</Text>
                    </View>
                    <Text style={styles.cardDesc}>Registro completo di chi ha assegnato i turni, quando e a chi.</Text>
                    
                {/* BOTTONI AUDIT */}
                    <View style={{flexDirection:'row', gap:10}}>
                        {/* PDF -> AZZURRO (Uniformato) */}
                        <TouchableOpacity style={[styles.btn, {backgroundColor: Colors.accentCyan, flex:1}]} onPress={() => handleDownload('AUDIT', 'PDF')} disabled={loading}>
                            {loading ? <ActivityIndicator color="#FFF"/> : <Text style={[styles.btnText, {color:'#000'}]}>📄 PDF</Text>}
                        </TouchableOpacity>

                        {/* EXCEL -> VERDE NUOVO */}
                        <TouchableOpacity style={[styles.btn, {backgroundColor: Colors.excelGreen, flex:1}]} onPress={() => handleDownload('AUDIT', 'EXCEL')} disabled={loading}>
                            <Text style={[styles.btnText, {color:'#FFF'}]}>📊 EXCEL</Text>
                        </TouchableOpacity>
                    </View>
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
