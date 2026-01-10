//PDFDelFounder.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, Platform, StatusBar, ActivityIndicator, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { db } from './firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { generatePDF } from './CreatorePDF'; // <--- Ora useremo il nuovo parametro
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

// --- MOTORE EXCEL (.xlsx) ---
    const generateExcel = async (title, data, type) => {
        try {
            let excelData = [];

            if (type === 'AUDIT') {
                // EXCEL SPECIFICO PER AUDIT (SOLO CHI HA FATTO COSA)
                excelData = data.map(item => ({
                    DATA_CREAZIONE: item.createdAt ? new Date(item.createdAt).toLocaleString('it-IT') : "N/D",
                    CHI_HA_ASSEGNATO: item.creatorName || "Sistema/Founder",
                    ASSEGNATO_A: item.collaboratorName || "N/D",
                    LUOGO: item.location || "---",
                    DATA_TURNO: item.date || "---",
                    ORARIO: `${item.startTime} - ${item.endTime}`
                }));
            } else {
                // EXCEL STANDARD (SOLDI E ORE)
                excelData = data.map(item => ({
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
            }

            const ws = XLSX.utils.json_to_sheet(excelData);
            
            // Larghezza colonne dinamica
            if (type === 'AUDIT') {
                ws['!cols'] = [{ wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 15 }];
            } else {
                ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 20 }];
            }

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Report");

            if (Platform.OS === 'web') {
                XLSX.writeFile(wb, `${title}.xlsx`);
            } else {
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
            Alert.alert("Errore Excel", e.message);
        }
    };
    
// --- FUNZIONE UNICA DI DOWNLOAD ---
    const handleDownload = async (type, format) => {
        if (type === 'INDIVIDUAL' && !selectedUser) { 
            Alert.alert("Attenzione", "Seleziona una persona dal menu."); 
            return; 
        }

        setLoading(true);
        try {
            let q;
            let title = "";
            
            if (type === 'INDIVIDUAL') {
                const userObj = users.find(u => u.id === selectedUser);
                const userName = userObj ? `${userObj.firstName} ${userObj.lastName}` : "Utente";
                title = `REPORT_${userName.toUpperCase()}`;
                
                q = query(
                    collection(db, "shifts"),
                    where("collaboratorId", "==", selectedUser),
                    where("status", "==", "completato"),
                );
            } 
            else if (type === 'FULL') {
                title = "REPORT_STAFF_COMPLETO";
                q = query(
                    collection(db, "shifts"), 
                    where("status", "==", "completato"), 
                );
            } 
            else if (type === 'AUDIT') {
                title = "AUDIT_ASSEGNAZIONI";
                // Per l'Audit prendiamo TUTTO (non solo completati) e anche recenti
                q = query(
                    collection(db, "shifts"), 
                );
            }

            const snapshot = await getDocs(q);
            let finalData = snapshot.docs.map(doc => doc.data());

            // Ordinamento
            if (type === 'AUDIT') {
                // Per Audit ordina per DATA CREAZIONE (il momento del click)
                finalData.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
            } else {
                // Per report finanziari ordina per DATA TURNO
                finalData.sort((a, b) => new Date(b.date) - new Date(a.date));
            }

            if (finalData.length === 0) { 
                Alert.alert("Vuoto", "Nessun dato trovato per il periodo selezionato."); 
                setLoading(false); 
                return; 
            }

            if (format === 'PDF') {
                const humanTitle = title.replace(/_/g, ' '); 
                // 🔥 MODIFICA CRUCIALE: Passiamo "type" (es: 'AUDIT') invece di booleano
                await generatePDF(humanTitle, finalData, type); 
            } else {
                await generateExcel(title, finalData, type);
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

                    <View style={{flexDirection:'row', gap:10}}>
                        <TouchableOpacity style={[styles.btn, {backgroundColor: Colors.accentCyan, flex:1}]} onPress={() => handleDownload('INDIVIDUAL', 'PDF')} disabled={loading || !selectedUser}>
                            {loading ? <ActivityIndicator color="#000"/> : <Text style={styles.btnText}>📄 PDF</Text>}
                        </TouchableOpacity>
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
                    
                    <View style={{flexDirection:'row', gap:10}}>
                        <TouchableOpacity style={[styles.btn, {backgroundColor: Colors.accentCyan, flex:1}]} onPress={() => handleDownload('FULL', 'PDF')} disabled={loading}>
                            {loading ? <ActivityIndicator color="#FFF"/> : <Text style={[styles.btnText, {color:'#000'}]}>📄 PDF</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.btn, {backgroundColor: Colors.excelGreen, flex:1}]} onPress={() => handleDownload('FULL', 'EXCEL')} disabled={loading}>
                            <Text style={[styles.btnText, {color:'#FFF'}]}>📊 EXCEL</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* 3. AUDIT ASSEGNAZIONI (REGISTRO POLIZIA) */}
                <View style={[styles.card, {borderColor: Colors.accentPurple}]}>
                    <View style={styles.cardHeader}>
                        <Feather name="eye" size={24} color={Colors.accentPurple} />
                        <Text style={[styles.cardTitle, {color: Colors.accentPurple}]}>LOG ASSEGNAZIONI</Text>
                    </View>
                    <Text style={styles.cardDesc}>Registro di controllo: Chi ha creato i turni, quando e a chi sono stati assegnati.</Text>
                    
                    <View style={{flexDirection:'row', gap:10}}>
                        <TouchableOpacity style={[styles.btn, {backgroundColor: Colors.accentCyan, flex:1}]} onPress={() => handleDownload('AUDIT', 'PDF')} disabled={loading}>
                            {loading ? <ActivityIndicator color="#FFF"/> : <Text style={[styles.btnText, {color:'#000'}]}>📄 PDF</Text>}
                        </TouchableOpacity>
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