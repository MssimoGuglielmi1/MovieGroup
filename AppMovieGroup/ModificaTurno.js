//ModificaTurno.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, SafeAreaView, Platform, StatusBar, Alert, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { db, auth } from './firebaseConfig';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const Colors = {
    background: '#000000', surface: '#1C1C1E', textPrimary: '#FFFFFF', textSecondary: '#8E8E93',
    primary: '#4CAF50', accent: '#0A84FF', error: '#FF453A', border: '#2C2C2E',
    yellow: '#EAB308', purple: '#A371F7', cyan: '#06b6d4'
};

export default function ModificaTurno({ navigation, route }) {
    const { shift } = route.params;

    const [location, setLocation] = useState(shift.location);
    const [date, setDate] = useState(new Date(shift.date));
    
    // Inizializzazione sicura date (per evitare crash su date invalide)
    const safeDateStart = shift.startTime ? new Date(`2000-01-01T${shift.startTime}`) : new Date();
    const safeDateEnd = shift.endTime ? new Date(`2000-01-01T${shift.endTime}`) : new Date();
    
    const [startTime, setStartTime] = useState(safeDateStart);
    const [endTime, setEndTime] = useState(safeDateEnd);
    const [payoutRate, setPayoutRate] = useState(shift.payoutRate);
    
    const [currentUserRole, setCurrentUserRole] = useState(null);
    const [currentUserId, setCurrentUserId] = useState(null);
    const [loading, setLoading] = useState(false);
    
    // Pickers
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showStartTimePicker, setShowStartTimePicker] = useState(false);
    const [showEndTimePicker, setShowEndTimePicker] = useState(false);

    useEffect(() => {
        const fetchUserRole = async () => {
            const uid = auth.currentUser.uid;
            setCurrentUserId(uid);
            const u = await getDoc(doc(db, "users", uid));
            if(u.exists()) setCurrentUserRole(u.data().role);
        };
        fetchUserRole();
    }, []);

    // --- FIX FORMATO ORA (HH:MM SICURO) ---
    // Fondamentale per non rompere i calcoli quando si modifica
    const formatTime = (dateObj) => {
        if(!dateObj) return "00:00";
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    };

    const formatDate = (d) => d.toISOString().split('T')[0];

    const handleSave = async () => {
        setLoading(true);
        try {
            const shiftRef = doc(db, "shifts", shift.id);
            await updateDoc(shiftRef, {
                location,
                date: formatDate(date),
                startTime: formatTime(startTime), // Usa la funzione sicura
                endTime: formatTime(endTime),     // Usa la funzione sicura
            });
            Alert.alert("Salvato", "Turno aggiornato.");
            navigation.goBack();
        } catch (e) { Alert.alert("Errore", e.message); }
        setLoading(false);
    };

// --- CESTINO BLINDATO (Funziona su Web e App) ---
    const handleDelete = async () => {
        // Funzione interna che fa il lavoro sporco
        const performDelete = async () => {
            try {
                await deleteDoc(doc(db, "shifts", shift.id));
                
                // Feedback per il Web
                if (Platform.OS === 'web') alert("Turno eliminato con successo.");
                
                navigation.goBack(); 
            } catch (error) {
                console.error("Errore cancellazione:", error);
                if (Platform.OS === 'web') alert("Errore: " + error.message);
                else Alert.alert("Errore", error.message);
            }
        };

        // --- BIVIO ---
        if (Platform.OS === 'web') {
            // SUL BROWSER (PC): Usa il popup nativo "Conferma?"
            if (confirm("Elimina: Sei sicuro di voler cancellare definitivamente questo turno?")) {
                performDelete();
            }
        } else {
            // SUL TELEFONO (APP): Usa il popup carino
            Alert.alert("Elimina", "Sei sicuro? L'operazione è irreversibile.", [
                { text: "No", style: "cancel" },
                { text: "Sì, Elimina", style: 'destructive', onPress: performDelete }
            ]);
        }
    };

    // --- LOGICA DI SICUREZZA BLINDATA ---
    const isFounder = currentUserRole === 'FOUNDER';
    
    // 1. È un Admin? (Controllo Ruolo salvato)
    const isTargetAdmin = shift.collaboratorRole === 'AMMINISTRATORE';
    
    // 2. Sono IO? (Controllo ID per evitare modifiche su se stessi)
    const isSelf = shift.collaboratorId === currentUserId;

    // BLOCCO TOTALE SE:
    // - Non sono il Founder E (il target è Admin OPPURE sono io stesso)
    const isRestricted = !isFounder && (isTargetAdmin || isSelf);

    // Messaggio personalizzato
    let restrictionMessage = "Non hai i permessi per modificare questo turno.";
    if (isSelf) restrictionMessage = "Non puoi modificare i tuoi turni per motivi di sicurezza.";
    else if (isTargetAdmin) restrictionMessage = "Non puoi modificare i turni di un altro Amministratore.";

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}><Feather name="arrow-left" size={24} color={Colors.textPrimary} /></TouchableOpacity>
                <Text style={styles.headerTitle}>{isRestricted ? "Dettagli (Sola Lettura)" : "Modifica Turno"}</Text>
                {/* Tasto elimina solo se non restricted */}
                {!isRestricted && <TouchableOpacity onPress={handleDelete}><Feather name="trash-2" size={24} color={Colors.error} /></TouchableOpacity>}
                {isRestricted && <View style={{width:24}}/>} 
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                
                {/* AVVISO DI SICUREZZA */}
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

                {/* FORM (Disabilitato se Restricted) */}
                <View style={[styles.card, isRestricted && {opacity: 0.5}]}>
                    <Text style={styles.label}>LUOGO</Text>
                    <TextInput 
                        style={styles.input} 
                        value={location} 
                        onChangeText={setLocation} 
                        editable={!isRestricted} 
                    />

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
                            <TouchableOpacity disabled={isRestricted} onPress={() => setShowStartTimePicker(true)} style={styles.input}>
                                <Text style={{color:'#FFF'}}>{formatTime(startTime)}</Text>
                            </TouchableOpacity>
                            {showStartTimePicker && <DateTimePicker value={startTime} mode="time" is24Hour={true} display="default" onChange={(e,d) => {setShowStartTimePicker(false); if(d) setStartTime(d)}} />}
                        </View>
                        <View style={{flex:1}}>
                            <Text style={styles.label}>FINE</Text>
                            <TouchableOpacity disabled={isRestricted} onPress={() => setShowEndTimePicker(true)} style={styles.input}>
                                <Text style={{color:'#FFF'}}>{formatTime(endTime)}</Text>
                            </TouchableOpacity>
                            {showEndTimePicker && <DateTimePicker value={endTime} mode="time" is24Hour={true} display="default" onChange={(e,d) => {setShowEndTimePicker(false); if(d) setEndTime(d)}} />}
                        </View>
                    </View>
</View>

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