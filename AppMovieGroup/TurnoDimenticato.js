//TurnoDimenticato.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, SafeAreaView, Platform, StatusBar, Alert, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { db, auth } from './firebaseConfig';
import { collection, addDoc, getDoc, doc, onSnapshot } from 'firebase/firestore';
import { sendPushNotification } from './Notifiche';

const Colors = {
    background: '#000000', surface: '#1C1C1E', textPrimary: '#FFFFFF', textSecondary: '#8E8E93',
    primary: '#EAB308', // GIALLO SOS
    accent: '#0A84FF', error: '#FF453A', border: '#2C2C2E',
    hidden: '#333'
};

export default function TurnoDimenticato({ navigation, route }) {
    const { activeCollaborators } = route.params || { activeCollaborators: [] };

    const [selectedCollaborator, setSelectedCollaborator] = useState('');
    const [location, setLocation] = useState('');
    
    // Default: Ieri
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const [date, setDate] = useState(yesterday);
    
    const [startTime, setStartTime] = useState(new Date());
    const [endTime, setEndTime] = useState(new Date(new Date().getTime() + 3600000)); 

    const [payoutRate, setPayoutRate] = useState('');
    const [rateType, setRateType] = useState('hourly'); 
    const [isLoadingSettings, setIsLoadingSettings] = useState(true);
    const [isConfigured, setIsConfigured] = useState(false);
    const [creatorName, setCreatorName] = useState(''); 
    const [loading, setLoading] = useState(false);
    
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showStartTimePicker, setShowStartTimePicker] = useState(false);
    const [showEndTimePicker, setShowEndTimePicker] = useState(false);

    useEffect(() => {
        // 1. Dati Founder
        const userRef = doc(db, "users", auth.currentUser.uid);
        const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
                const userData = docSnap.data();
                const fullName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
                setCreatorName(fullName || "Founder");
            }
        });

        // 2. Configurazione Banca
        const fetchGlobalSettings = async () => {
            try {
                const docSnap = await getDoc(doc(db, "settings", "globalConfig"));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if(data.defaultRate) {
                        setPayoutRate(data.defaultRate);
                        setRateType(data.defaultType || 'hourly');
                        setIsConfigured(true);
                    }
                }
            } catch (e) { console.log("Errore config", e); } finally { setIsLoadingSettings(false); }
        };
        fetchGlobalSettings();
        return () => unsubscribeUser();
    }, []);

    // --- FIX FUSO ORARIO ITALIA ---
    // Questo garantisce che la data salvata sia quella che vedi sul telefono
    const formatDate = (dateObj) => {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

// FIX FORMATO ORA (HH:MM SICURO)
    const formatTime = (dateObj) => {
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    };

    // FILTRO COLLABORATORI
    const filteredCollaborators = activeCollaborators.filter(c => 
        c.role === 'COLLABORATORE' || c.role === 'AMMINISTRATORE'
    );

    // --- SALVATAGGIO BILINGUE (WEB + APP) ---
    const handleSave = async () => {
        // Validazione Bilingue
        if (!selectedCollaborator || !location) { 
            const msg = "Mancano dati: Chi ha lavorato e dove?";
            if (Platform.OS === 'web') alert(msg); else Alert.alert("Mancano dati", msg);
            return; 
        }
        if (!isConfigured) { 
            const msg = "Errore: Configura prima la tariffa base nella Home.";
            if (Platform.OS === 'web') alert(msg); else Alert.alert("Errore", msg);
            return; 
        }

        setLoading(true);
        try {
            const collabData = activeCollaborators.find(c => c.id === selectedCollaborator);
            const collabName = collabData ? `${collabData.firstName} ${collabData.lastName}` : "Sconosciuto";
            const realRole = collabData ? collabData.role : 'COLLABORATORE';

            // --- 🛠️ FIX CENERENTOLA (Gestione Notte) 🛠️ ---
            // Creiamo gli oggetti data per Start e End usando l'orario locale
            let startObj = new Date(date.getFullYear(), date.getMonth(), date.getDate(), startTime.getHours(), startTime.getMinutes());
            let endObj = new Date(date.getFullYear(), date.getMonth(), date.getDate(), endTime.getHours(), endTime.getMinutes());

            // SE la fine è prima dell'inizio (es. 00:00 < 20:00), aggiungi 1 giorno alla fine
            if (endObj < startObj) {
                endObj.setDate(endObj.getDate() + 1);
            }
            // ------------------------------------------------

            const shiftData = {
                collaboratorId: selectedCollaborator,
                collaboratorName: collabName,
                collaboratorRole: realRole,
                location: location,
                date: formatDate(date),
                startTime: formatTime(startTime),
                endTime: formatTime(endTime),
                payoutRate: payoutRate, 
                rateType: rateType,
                // Status forzato a completato
                status: 'completato',     
                // Orari reali corretti (con il giorno in più se serve)
                realStartTime: startObj.toISOString(),
                realEndTime: endObj.toISOString(),
                createdBy: auth.currentUser.uid,
                creatorName: creatorName,
                createdAt: new Date().toISOString(),
                isRecovery: true 
            };

            await addDoc(collection(db, "shifts"), shiftData);

            // --- INVIO NOTIFICA ---
            if (collabData && collabData.expoPushToken) {
                await sendPushNotification(collabData.expoPushToken, "📝 Aggiornamento Storico", `È stato aggiunto un turno passato a ${location} nel tuo storico.`);
            }
            // ----------------------

            // Successo Bilingue
            const successMsg = "Recuperato! Il turno è stato salvato in archivio.";
            if (Platform.OS === 'web') alert(successMsg); 
            else Alert.alert("Recuperato!", successMsg);
            
            navigation.goBack();
        } catch (error) { 
            const errorMsg = "Impossibile salvare: " + error.message;
            if (Platform.OS === 'web') alert(errorMsg); 
            else Alert.alert("Errore", errorMsg);
        } 
        finally { setLoading(false); }
    };

    const onDateChange = (event, selectedDate) => { setShowDatePicker(false); if(selectedDate) setDate(selectedDate); };
    const onStartTimeChange = (event, selectedDate) => { setShowStartTimePicker(false); if(selectedDate) setStartTime(selectedDate); };
    const onEndTimeChange = (event, selectedDate) => { setShowEndTimePicker(false); if(selectedDate) setEndTime(selectedDate); };

    // --- FIX PER WEB: Input Date/Time HTML ---
    const isWeb = Platform.OS === 'web';

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}><Feather name="arrow-left" size={24} color={Colors.textPrimary} /></TouchableOpacity>
                <Text style={styles.headerTitle}>Recupero SOS 🆘</Text>
                <View style={{width:24}}/>
            </View>

            {isLoadingSettings ? <ActivityIndicator style={{marginTop:100}} color={Colors.primary} size="large" /> :
            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.alertBox}>
                    <Feather name="info" size={20} color="#000" style={{marginRight:10}}/>
                    <Text style={{color:'#000', fontSize:12, flex:1}}>Stai inserendo un turno passato. Verrà salvato direttamente come <Text style={{fontWeight:'bold'}}>COMPLETATO</Text>.</Text>
                </View>

                {/* SCELTA PERSONA */}
                <View style={styles.sectionCard}>
                    <Text style={styles.label}>CHI HA LAVORATO?</Text>
                    <View style={styles.pickerWrapper}>
                        <Picker 
                            selectedValue={selectedCollaborator} 
                            onValueChange={(v) => setSelectedCollaborator(v)} 
                            dropdownIconColor={Colors.textPrimary} 
                            style={{ color: Colors.textPrimary }}
                            itemStyle={{ color: isWeb ? '#000' : '#FFFFFF' }} // Web vuole nero, iOS bianco
                        >
                            <Picker.Item label="Seleziona..." value="" color={Colors.textSecondary}/>
                            {filteredCollaborators.map((collab) => (
                                <Picker.Item 
                                    key={collab.id} 
                                    label={`${collab.firstName} ${collab.lastName} ${collab.role === 'AMMINISTRATORE' ? '(Admin)' : ''}`} 
                                    value={collab.id} 
                                    color={Platform.OS === 'ios' ? '#FFFFFF' : '#000000'} 
                                />
                            ))}
                        </Picker>
                    </View>
                </View>

                <View style={styles.sectionCard}>
                    <Text style={styles.label}>DOVE?</Text>
                    <TextInput style={styles.input} placeholder="Luogo" placeholderTextColor={Colors.textSecondary} value={location} onChangeText={setLocation} />

                    <Text style={[styles.label, {marginTop:15}]}>QUANDO?</Text>
                    
                    {/* DATA (Gestione Web vs App) */}
                    {isWeb ? (
                        <input 
                            type="date" 
                            value={date.toISOString().split('T')[0]} 
                            onChange={(e) => setDate(new Date(e.target.value))}
                            style={styles.webInput}
                        />
                    ) : (
                        <>
                            <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.dateButton}>
                                <Feather name="calendar" size={20} color={Colors.textPrimary} />
                                <Text style={styles.dateText}>{formatDate(date)}</Text>
                            </TouchableOpacity>
                            {showDatePicker && <DateTimePicker value={date} mode="date" display="default" onChange={onDateChange} />}
                        </>
                    )}

                    <View style={{flexDirection:'row', gap:10, marginTop:10}}>
                        <View style={{flex:1}}>
                            <Text style={styles.label}>INIZIO</Text>
                            {isWeb ? (
                                <input 
                                    type="time" 
                                    value={formatTime(startTime)}
                                    onChange={(e) => {
                                        const [h, m] = e.target.value.split(':');
                                        const d = new Date(startTime);
                                        d.setHours(h); d.setMinutes(m);
                                        setStartTime(d);
                                    }}
                                    style={styles.webInput}
                                />
                            ) : (
                                <>
                                    <TouchableOpacity onPress={() => setShowStartTimePicker(true)} style={styles.timeButton}><Text style={styles.timeText}>{formatTime(startTime)}</Text></TouchableOpacity>
                                    {showStartTimePicker && <DateTimePicker value={startTime} mode="time" is24Hour={true} display="default" onChange={onStartTimeChange} />}
                                </>
                            )}
                        </View>
                        <View style={{flex:1}}>
                            <Text style={styles.label}>FINE</Text>
                            {isWeb ? (
                                <input 
                                    type="time" 
                                    value={formatTime(endTime)}
                                    onChange={(e) => {
                                        const [h, m] = e.target.value.split(':');
                                        const d = new Date(endTime);
                                        d.setHours(h); d.setMinutes(m);
                                        setEndTime(d);
                                    }}
                                    style={styles.webInput}
                                />
                            ) : (
                                <>
                                    <TouchableOpacity onPress={() => setShowEndTimePicker(true)} style={styles.timeButton}><Text style={styles.timeText}>{formatTime(endTime)}</Text></TouchableOpacity>
                                    {showEndTimePicker && <DateTimePicker value={endTime} mode="time" is24Hour={true} display="default" onChange={onEndTimeChange} />}
                                </>
                            )}
                        </View>
                    </View>
                </View>

                <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={loading}>
                    {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.saveButtonText}>SALVA IN ARCHIVIO</Text>}
                </TouchableOpacity>
            </ScrollView>}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: Colors.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.primary },
    content: { padding: 20 },
    alertBox: { backgroundColor: Colors.primary, borderRadius: 10, padding: 15, flexDirection:'row', alignItems:'center', marginBottom: 20 },
    sectionCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: Colors.border },
    label: { color: Colors.textSecondary, fontSize: 10, fontWeight: '900', marginBottom: 8, letterSpacing: 1 },
    pickerWrapper: { backgroundColor: '#000', borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
    input: { backgroundColor: '#000', color: Colors.textPrimary, padding: 15, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, fontSize: 16 },
    dateButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#000', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
    dateText: { color: Colors.textPrimary, fontSize: 16, fontWeight: 'bold', marginLeft: 10 },
    timeButton: { backgroundColor: '#000', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems:'center' },
    timeText: { color: Colors.textPrimary, fontSize: 18, fontWeight: 'bold' },
    saveButton: { backgroundColor: Colors.primary, padding: 20, borderRadius: 16, alignItems: 'center', marginTop: 10, elevation: 5 },
    saveButtonText: { color: '#000', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
    
    // Stile specifico per input Web
    webInput: {
        backgroundColor: '#fff',
        color: '#000',
        padding: 10,
        borderRadius: 8,
        fontSize: 16,
        border: '1px solid #333',
        width: '100%',
        height: 40
    }
});
