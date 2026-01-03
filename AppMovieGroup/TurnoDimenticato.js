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

    // Adesso è una lista (Array) vuota
    const [selectedCollaborators, setSelectedCollaborators] = useState([]);
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

    // --- FUNZIONE MANCANTE (Il Colpevole!) ---
    const formatRoleLabel = (role) => {
        if (!role) return '';
        if (role === 'AMMINISTRATORE') return ' (Admin)';
        if (role === 'FOUNDER') return ' (Founder)';
        return ''; // Se è collaboratore semplice, non scriviamo nulla
    };

    // FILTRO COLLABORATORI
    const filteredCollaborators = activeCollaborators.filter(c => 
        c.role === 'COLLABORATORE' || c.role === 'AMMINISTRATORE'
    );

    // --- FUNZIONI MULTI-SELEZIONE ---
    const toggleCollaborator = (id) => {
        if (selectedCollaborators.includes(id)) {
            // Se c'è già, lo togliamo
            setSelectedCollaborators(prev => prev.filter(cId => cId !== id)); 
        } else {
            // Se non c'è, lo aggiungiamo
            setSelectedCollaborators(prev => [...prev, id]); 
        }
    };

    const toggleSelectAll = () => {
        // Se sono tutti selezionati, svuota tutto. Altrimenti seleziona tutti.
        if (selectedCollaborators.length === activeCollaborators.length) {
            setSelectedCollaborators([]); 
        } else {
            setSelectedCollaborators(activeCollaborators.map(c => c.id)); 
        }
    };

// --- SALVATAGGIO MASSIVO (MITRAGLIATRICE) ---
    const handleSave = async () => {
        const showAlert = (t, m) => Platform.OS === 'web' ? alert(`${t}: ${m}`) : Alert.alert(t, m);

        // 1. Validazione: Controlliamo se la lista è vuota
        if (selectedCollaborators.length === 0 || !location) { 
            showAlert("Mancano dati", "Seleziona almeno una persona e inserisci il luogo.");
            return; 
        }
        if (!isConfigured) { 
            showAlert("Errore", "Configura prima la tariffa base nella Home.");
            return; 
        }

        setLoading(true);
        try {
            // Creiamo gli oggetti data per Start e End (Gestione Notte)
            let startObj = new Date(date.getFullYear(), date.getMonth(), date.getDate(), startTime.getHours(), startTime.getMinutes());
            let endObj = new Date(date.getFullYear(), date.getMonth(), date.getDate(), endTime.getHours(), endTime.getMinutes());

            if (endObj < startObj) {
                endObj.setDate(endObj.getDate() + 1);
            }

            // --- CICLO DI CREAZIONE ---
            const createPromises = selectedCollaborators.map(async (collabId) => {
                const collabData = activeCollaborators.find(c => c.id === collabId);
                const collabName = collabData ? `${collabData.firstName} ${collabData.lastName}` : "Sconosciuto";
                const realRole = collabData ? collabData.role : 'COLLABORATORE';

                const shiftData = {
                    collaboratorId: collabId,
                    collaboratorName: collabName,
                    collaboratorRole: realRole,
                    location: location,
                    date: formatDate(date),
                    startTime: formatTime(startTime),
                    endTime: formatTime(endTime),
                    payoutRate: payoutRate, 
                    rateType: rateType,
                    status: 'completato', // Nasce già completato (è un recupero!)
                    realStartTime: startObj.toISOString(),
                    realEndTime: endObj.toISOString(),
                    createdBy: auth.currentUser.uid,
                    creatorName: creatorName,
                    createdAt: new Date().toISOString(),
                    isRecovery: true 
                };

                await addDoc(collection(db, "shifts"), shiftData);

                // Notifica Push (Opzionale per recupero, ma utile)
                if (collabData && collabData.expoPushToken) {
                    await sendPushNotification(collabData.expoPushToken, "📝 Aggiornamento Storico", `È stato aggiunto un turno passato a ${location} nel tuo storico.`);
                }
            });

            // Aspettiamo che tutti i salvataggi finiscano
            await Promise.all(createPromises);

            showAlert("Recuperato!", `${selectedCollaborators.length} Turni salvati in archivio.`);
            
            // --- NON TORNA INDIETRO ---
            setSelectedCollaborators([]); // Pulisce solo i nomi
            // Location, Data e Ora restano lì pronte per il prossimo gruppo

        } catch (error) { 
            showAlert("Errore", "Impossibile salvare: " + error.message);
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

{/* --- LISTA MULTI-SELEZIONE --- */}
                <View style={styles.sectionCard}>
                    <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15}}>
                        <Text style={styles.label}>CHI HA LAVORATO? ({selectedCollaborators.length})</Text>
                        <TouchableOpacity onPress={toggleSelectAll}>
                            <Text style={{color: Colors.primary, fontWeight:'bold', fontSize:12}}>
                                {selectedCollaborators.length === activeCollaborators.length ? "DESELEZIONA" : "TUTTI"}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* STILI LISTA: Ho usato styles.listContainer che dobbiamo aggiungere sotto */}
                    <View style={styles.listContainer}>
                        <ScrollView nestedScrollEnabled={true} style={{maxHeight: 250}}>
                            {activeCollaborators.map((collab) => {
                                // È selezionato?
                                const isSelected = selectedCollaborators.includes(collab.id);
                                return (
                                    <TouchableOpacity 
                                        key={collab.id} 
                                        style={[styles.collabItem, isSelected && styles.collabItemSelected]}
                                        onPress={() => toggleCollaborator(collab.id)}
                                    >
                                        <View style={{flexDirection:'row', alignItems:'center'}}>
                                            <Feather 
                                                name={isSelected ? "check-square" : "square"} 
                                                size={20} 
                                                color={isSelected ? Colors.success : Colors.textSecondary} 
                                                style={{marginRight: 10}}
                                            />
                                            <Text style={[styles.collabName, isSelected && {color: '#FFF', fontWeight:'bold'}]}>
                                                {collab.firstName} {collab.lastName} <Text style={{fontSize:10, color: Colors.textSecondary}}>{formatRoleLabel(collab.role)}</Text>
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                )
                            })}
                        </ScrollView>
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
    webInput: {backgroundColor: '#fff',color: '#000',padding: 10,borderRadius: 8,fontSize: 16,border: '1px solid #333',width: '100%',height: 40},
    listContainer: { backgroundColor: '#000', borderRadius: 10, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
    collabItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
    collabItemSelected: { backgroundColor: Colors.success + '20' },
    collabName: { color: Colors.textSecondary, fontSize: 14 },
});
