// ModificaTurno.js (AGGIORNATO CON GESTIONE PAUSA ⏸️)
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, SafeAreaView, Platform, StatusBar, Alert, ActivityIndicator, Switch } from 'react-native';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { db, auth } from './firebaseConfig';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { sendPushNotification } from './Notifiche';

const Colors = {
    background: '#000000', surface: '#1C1C1E', textPrimary: '#FFFFFF', textSecondary: '#8E8E93',
    primary: '#4CAF50', accent: '#0A84FF', error: '#FF453A', border: '#2C2C2E',
    yellow: '#EAB308', purple: '#A371F7', cyan: '#06b6d4', orange: '#F97316'
};

export default function ModificaTurno({ navigation, route }) {
    const { shift } = route.params;

    // --- FUNZIONE DI SICUREZZA PER LE DATE (Italiano vs Inglese) ---
    const parseDateSafe = (dateString) => {
        if (!dateString) return new Date();
        
        // Se trova le barre (es. 17/2/2026), lo converte a mano
        if (dateString.includes('/')) {
            const parts = dateString.split('/');
            // Gestisce sia D/M/YYYY che DD/MM/YYYY
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10);
            const year = parseInt(parts[2], 10);
            return new Date(year, month - 1, day);
        }
        
        // Altrimenti prova il metodo standard (es. 2026-02-17)
        const standardDate = new Date(dateString);
        // Se ancora non va bene, ritorna oggi per non crashare
        return isNaN(standardDate.getTime()) ? new Date() : standardDate;
    };

    const [location, setLocation] = useState(shift.location);
    // Usiamo la funzione sicura qui sotto:
    const [date, setDate] = useState(parseDateSafe(shift.date));
    
    // --- INIZIALIZZAZIONE DATE E ORARI ---
    // Ricostruiamo gli oggetti Date partendo dalle stringhe "HH:mm"
    const safeDateStart = shift.startTime ? new Date(`2000-01-01T${shift.startTime}:00`) : new Date();
    const safeDateEnd = shift.endTime ? new Date(`2000-01-01T${shift.endTime}:00`) : new Date();
    
    const [startTime, setStartTime] = useState(safeDateStart);
    const [endTime, setEndTime] = useState(safeDateEnd);

    // --- GESTIONE PAUSA (Nuova) ⏸️ ---
    const [hasBreak, setHasBreak] = useState(shift.hasBreak || false);
    
    // Se c'erano orari pausa salvati, li usiamo. Altrimenti default (+30 min)
    const safeBreakStart = shift.breakStartTime ? new Date(`2000-01-01T${shift.breakStartTime}:00`) : new Date();
    const safeBreakEnd = shift.breakEndTime ? new Date(`2000-01-01T${shift.breakEndTime}:00`) : new Date(safeBreakStart.getTime() + 1800000);

    const [breakStartTime, setBreakStartTime] = useState(safeBreakStart);
    const [breakEndTime, setBreakEndTime] = useState(safeBreakEnd);

    const [payoutRate, setPayoutRate] = useState(shift.payoutRate);
    
    const [currentUserRole, setCurrentUserRole] = useState(null);
    const [currentUserId, setCurrentUserId] = useState(null);
    const [loading, setLoading] = useState(false);
    
    // Pickers Visibilità
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showStartTimePicker, setShowStartTimePicker] = useState(false);
    const [showEndTimePicker, setShowEndTimePicker] = useState(false);
    const [showBreakStartPicker, setShowBreakStartPicker] = useState(false);
    const [showBreakEndPicker, setShowBreakEndPicker] = useState(false);

    useEffect(() => {
        const fetchUserRole = async () => {
            const uid = auth.currentUser.uid;
            setCurrentUserId(uid);
            const u = await getDoc(doc(db, "users", uid));
            if(u.exists()) setCurrentUserRole(u.data().role);
        };
        fetchUserRole();
    }, []);

    // Helper formattazione ora
    const formatTime = (dateObj) => {
        if(!dateObj) return "00:00";
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    };

    const formatDate = (d) => d.toISOString().split('T')[0];

    // --- FUNZIONE NOTIFICA CAMBIAMENTI ---
    const notifyCollaborator = async (type) => {
        try {
            const userSnap = await getDoc(doc(db, "users", shift.collaboratorId));
            if (userSnap.exists()) {
                const userData = userSnap.data();
                if (userData.expoPushToken) {
                    let title, body;
                    if (type === 'DELETE') {
                        title = "🗑️ TURNO ANNULLATO";
                        body = `Il turno a ${shift.location} del ${shift.date} è stato CANCELLATO.`;
                    } else {
                        title = "⚠️ MODIFICA TURNO";
                        body = `Variazioni per il turno a ${location}. Orari: ${formatTime(startTime)} - ${formatTime(endTime)}.`;
                    }
                    await sendPushNotification(userData.expoPushToken, title, body);
                }
            }
        } catch (error) {
            console.log("Errore notifica modifica:", error);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            // 🛡️ BLOCCO SICUREZZA PAUSA (NUOVO)
            if (hasBreak) {
                // Costruiamo date complete per la Pausa
                let bStartObj = new Date(date.getFullYear(), date.getMonth(), date.getDate(), breakStartTime.getHours(), breakStartTime.getMinutes());
                let bEndObj = new Date(date.getFullYear(), date.getMonth(), date.getDate(), breakEndTime.getHours(), breakEndTime.getMinutes());

                // Costruiamo date complete per il Turno
                let shiftStartObj = new Date(date.getFullYear(), date.getMonth(), date.getDate(), startTime.getHours(), startTime.getMinutes());
                let shiftEndObj = new Date(date.getFullYear(), date.getMonth(), date.getDate(), endTime.getHours(), endTime.getMinutes());

                // Gestione scavallamento notte
                if (shiftEndObj < shiftStartObj) shiftEndObj.setDate(shiftEndObj.getDate() + 1);
                if (bEndObj < bStartObj) bEndObj.setDate(bEndObj.getDate() + 1);

                // Allineamento Pausa se il turno scavalca la notte
                if (shiftStartObj.getDate() !== shiftEndObj.getDate()) {
                    if (bStartObj.getHours() < 12 && shiftStartObj.getHours() > 12) {
                        bStartObj.setDate(bStartObj.getDate() + 1);
                        bEndObj.setDate(bEndObj.getDate() + 1);
                    }
                }

                // CONTROLLO SPIETATO 👮‍♂️
                if (bStartObj < shiftStartObj || bEndObj > shiftEndObj) {
                    // Alert diverso per Web e Mobile
                    if (Platform.OS === 'web') {
                        alert("Errore Pausa ⚠️: La pausa deve essere INTERNA al turno.");
                    } else {
                        Alert.alert("Errore Pausa ⚠️", "La pausa deve essere INTERNA al turno.\nControlla gli orari.");
                    }
                    setLoading(false); // <--- IMPORTANTE: Spegni la rotellina!
                    return; // ⛔ STOP
                }
            }
            const shiftRef = doc(db, "shifts", shift.id);
            
            // Prepariamo i dati da aggiornare
            const updateData = {
                location,
                date: formatDate(date),
                startTime: formatTime(startTime),
                endTime: formatTime(endTime),
                // --- CAMPI PAUSA AGGIUNTI ---
                hasBreak: hasBreak,
                breakStartTime: hasBreak ? formatTime(breakStartTime) : null,
                breakEndTime: hasBreak ? formatTime(breakEndTime) : null
            };

            await updateDoc(shiftRef, updateData);

            await notifyCollaborator('UPDATE'); 

            Alert.alert("Salvato", "Turno aggiornato con successo.");
            navigation.goBack();
        } catch (e) { Alert.alert("Errore", e.message); }
        setLoading(false);
    };

    // --- CESTINO ---
    const handleDelete = async () => {
        const performDelete = async () => {
            try {
                await notifyCollaborator('DELETE');
                await deleteDoc(doc(db, "shifts", shift.id));
                if (Platform.OS === 'web') alert("Turno eliminato.");
                navigation.goBack(); 
            } catch (error) {
                if (Platform.OS === 'web') alert("Errore: " + error.message);
                else Alert.alert("Errore", error.message);
            }
        };

        if (Platform.OS === 'web') {
            if (confirm("Sei sicuro di voler cancellare questo turno?")) performDelete();
        } else {
            Alert.alert("Elimina", "Sei sicuro? L'operazione è irreversibile.", [
                { text: "No", style: "cancel" },
                { text: "Sì, Elimina", style: 'destructive', onPress: performDelete }
            ]);
        }
    };

    // --- LOGICA DI SICUREZZA ---
    const isFounder = currentUserRole === 'FOUNDER';
    const isTargetAdmin = shift.collaboratorRole === 'AMMINISTRATORE';
    const isSelf = shift.collaboratorId === currentUserId;
    const isRestricted = !isFounder && (isTargetAdmin || isSelf);

    let restrictionMessage = "Non hai i permessi per modificare questo turno.";
    if (isSelf) restrictionMessage = "Non puoi modificare i tuoi turni per sicurezza.";
    else if (isTargetAdmin) restrictionMessage = "Non puoi modificare i turni di un altro Admin.";

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}><Feather name="arrow-left" size={24} color={Colors.textPrimary} /></TouchableOpacity>
                <Text style={styles.headerTitle}>{isRestricted ? "Dettagli Turno" : "Modifica Turno"}</Text>
                {!isRestricted && <TouchableOpacity onPress={handleDelete}><Feather name="trash-2" size={24} color={Colors.error} /></TouchableOpacity>}
                {isRestricted && <View style={{width:24}}/>} 
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                
                {isRestricted && (
                    <View style={styles.lockedBox}>
                        <Feather name="shield" size={24} color={Colors.yellow} />
                        <Text style={styles.lockedText}>{restrictionMessage}</Text>
                    </View>
                )}

                <View style={[styles.card, {borderColor: Colors.accent}]}>
                    <Text style={{color:Colors.accent, fontWeight:'bold', marginBottom:5}}>COLLABORATORE</Text>
                    <Text style={{color:'#FFF', fontSize:18, fontWeight:'bold'}}>{shift.collaboratorName}</Text>
                    {isTargetAdmin && <Text style={{color:Colors.cyan, fontSize:10, fontWeight:'bold', marginTop:2}}>AMMINISTRATORE</Text>}
                </View>

                {/* FORM PRINCIPALE */}
                <View style={[styles.card, isRestricted && {opacity: 0.5}]}>
                    <Text style={styles.label}>LUOGO</Text>
                    <TextInput style={styles.input} value={location} onChangeText={setLocation} editable={!isRestricted} />

                    <Text style={styles.label}>DATA</Text>
                    {Platform.OS === 'web' ? (
                         <TextInput style={styles.input} value={formatDate(date)} editable={false} /> 
                    ) : (
                        <>
                            <TouchableOpacity disabled={isRestricted} onPress={() => setShowDatePicker(true)} style={styles.input}>
                                <Text style={{color:'#FFF'}}>{formatDate(date)}</Text>
                            </TouchableOpacity>
                            {showDatePicker && <DateTimePicker value={date} mode="date" onChange={(e,d) => {setShowDatePicker(false); if(d) setDate(d)}} />}
                        </>
                    )}

                    <View style={{flexDirection:'row', gap:10}}>
                        <View style={{flex:1}}>
                            <Text style={styles.label}>INIZIO</Text>
                            {Platform.OS === 'web' ? (
                                <View style={{height: 50}}>
                                    <input type="time" value={startTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} onChange={(e) => { const [h, m] = e.target.value.split(':'); const d = new Date(startTime); d.setHours(h); d.setMinutes(m); setStartTime(d); }} style={{width:'100%', height:'100%', borderRadius:8, border:'1px solid #333', backgroundColor:'#000', color:'white', fontSize:16, padding:10}} disabled={isRestricted}/>
                                </View>
                            ) : (
                                <>
                                    <TouchableOpacity disabled={isRestricted} onPress={() => setShowStartTimePicker(true)} style={styles.input}>
                                        <Text style={{color:'#FFF'}}>{formatTime(startTime)}</Text>
                                    </TouchableOpacity>
                                    {showStartTimePicker && <DateTimePicker value={startTime} mode="time" is24Hour={true} display="default" onChange={(e,d) => {setShowStartTimePicker(false); if(d) setStartTime(d)}} />}
                                </>
                            )}
                        </View>
                        <View style={{flex:1}}>
                            <Text style={styles.label}>FINE</Text>
                            {Platform.OS === 'web' ? (
                                <View style={{height: 50}}>
                                    <input type="time" value={endTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} onChange={(e) => { const [h, m] = e.target.value.split(':'); const d = new Date(endTime); d.setHours(h); d.setMinutes(m); setEndTime(d); }} style={{width:'100%', height:'100%', borderRadius:8, border:'1px solid #333', backgroundColor:'#000', color:'white', fontSize:16, padding:10}} disabled={isRestricted}/>
                                </View>
                            ) : (
                                <>
                                    <TouchableOpacity disabled={isRestricted} onPress={() => setShowEndTimePicker(true)} style={styles.input}>
                                        <Text style={{color:'#FFF'}}>{formatTime(endTime)}</Text>
                                    </TouchableOpacity>
                                    {showEndTimePicker && <DateTimePicker value={endTime} mode="time" is24Hour={true} display="default" onChange={(e,d) => {setShowEndTimePicker(false); if(d) setEndTime(d)}} />}
                                </>
                            )}
                        </View>
                    </View>
                </View>

                {/* --- SEZIONE PAUSA (NUOVA) ⏸️ --- */}
                {!isRestricted && (
                <View style={[styles.card, {borderColor: Colors.orange}]}>
                    <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                        <View style={{flexDirection:'row', alignItems:'center'}}>
                            <Feather name="coffee" size={18} color={Colors.orange} />
                            <Text style={{color: Colors.orange, fontWeight:'bold', marginLeft:10}}>PAUSA PRANZO / CENA</Text>
                        </View>
                        <Switch 
                            value={hasBreak} 
                            onValueChange={setHasBreak}
                            trackColor={{ false: "#767577", true: Colors.orange }}
                            thumbColor={hasBreak ? "#FFF" : "#f4f3f4"}
                        />
                    </View>

                    {hasBreak && (
                        <View style={{marginTop: 15, borderTopWidth:1, borderTopColor:Colors.border, paddingTop:15}}>
                            <View style={{flexDirection:'row', gap:10}}>
                                {/* INIZIO PAUSA */}
                                <View style={{flex:1}}>
                                    <Text style={[styles.label, {color:Colors.orange}]}>INIZIO PAUSA</Text>
                                    {Platform.OS === 'web' ? (
                                        <View style={{height: 50}}>
                                            <input type="time" value={breakStartTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} onChange={(e) => { const [h, m] = e.target.value.split(':'); const d = new Date(breakStartTime); d.setHours(h); d.setMinutes(m); setBreakStartTime(d); }} style={{width:'100%', height:'100%', borderRadius:8, border:'1px solid orange', backgroundColor:'#fff7ed', color:'black', fontSize:16, padding:10}} />
                                        </View>
                                    ) : (
                                        <>
                                            <TouchableOpacity onPress={() => setShowBreakStartPicker(true)} style={[styles.input, {borderColor: Colors.orange}]}>
                                                <Text style={{color:Colors.orange, fontWeight:'bold'}}>{formatTime(breakStartTime)}</Text>
                                            </TouchableOpacity>
                                            {showBreakStartPicker && <DateTimePicker value={breakStartTime} mode="time" is24Hour={true} display="default" onChange={(e,d) => {setShowBreakStartPicker(false); if(d) setBreakStartTime(d)}} />}
                                        </>
                                    )}
                                </View>

                                {/* FINE PAUSA */}
                                <View style={{flex:1}}>
                                    <Text style={[styles.label, {color:Colors.orange}]}>FINE PAUSA</Text>
                                    {Platform.OS === 'web' ? (
                                        <View style={{height: 50}}>
                                            <input type="time" value={breakEndTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} onChange={(e) => { const [h, m] = e.target.value.split(':'); const d = new Date(breakEndTime); d.setHours(h); d.setMinutes(m); setBreakEndTime(d); }} style={{width:'100%', height:'100%', borderRadius:8, border:'1px solid orange', backgroundColor:'#fff7ed', color:'black', fontSize:16, padding:10}} />
                                        </View>
                                    ) : (
                                        <>
                                            <TouchableOpacity onPress={() => setShowBreakEndPicker(true)} style={[styles.input, {borderColor: Colors.orange}]}>
                                                <Text style={{color:Colors.orange, fontWeight:'bold'}}>{formatTime(breakEndTime)}</Text>
                                            </TouchableOpacity>
                                            {showBreakEndPicker && <DateTimePicker value={breakEndTime} mode="time" is24Hour={true} display="default" onChange={(e,d) => {setShowBreakEndPicker(false); if(d) setBreakEndTime(d)}} />}
                                        </>
                                    )}
                                </View>
                            </View>
                        </View>
                    )}
                </View>
                )}

                {!isRestricted && (
                    <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
                        {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.saveText}>SALVA MODIFICHE</Text>}
                    </TouchableOpacity>
                )}

            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: Colors.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },
    content: { padding: 20 },
    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 15, marginBottom: 20, borderWidth: 1, borderColor: Colors.border },
    label: { color: Colors.textSecondary, fontSize: 10, fontWeight: 'bold', marginBottom: 5, marginTop: 10 },
    input: { backgroundColor: '#000', color: '#FFF', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, fontSize: 16 },
    saveBtn: { backgroundColor: Colors.primary, padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 20 },
    saveText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
    lockedBox: { flexDirection:'row', alignItems:'center', backgroundColor: Colors.yellow+'20', padding: 15, borderRadius: 12, marginBottom: 20, borderWidth:1, borderColor: Colors.yellow },
    lockedText: { color: Colors.yellow, marginLeft: 10, flex: 1, fontSize: 12 }
});
