//CreateShiftScreen.js
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
    primary: '#4CAF50', accent: '#0A84FF', error: '#FF453A', border: '#2C2C2E',
    yellow: '#EAB308', purple: '#A371F7', hidden: '#333'
};

export default function CreateShiftScreen({ navigation, route }) {
    const { activeCollaborators } = route.params || { activeCollaborators: [] };

    const [selectedCollaborators, setSelectedCollaborators] = useState([]);
    const [location, setLocation] = useState('');
    
    // Date e Orari
    const [date, setDate] = useState(new Date());
    const [startTime, setStartTime] = useState(new Date());
    const [endTime, setEndTime] = useState(new Date(new Date().getTime() + 3600000)); // +1 ora default

    // ECONOMIA & RUOLI
    const [payoutRate, setPayoutRate] = useState('');
    const [rateType, setRateType] = useState('hourly'); 
    const [isLoadingSettings, setIsLoadingSettings] = useState(true);
    const [isConfigured, setIsConfigured] = useState(false);
    const [canSeeMoney, setCanSeeMoney] = useState(true);

    // Dati del creatore
    const [creatorRole, setCreatorRole] = useState(null); 
    const [creatorName, setCreatorName] = useState(''); 

    const [loading, setLoading] = useState(false);
    
    // VISIBILITÀ POPUP (Solo per Mobile)
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showStartTimePicker, setShowStartTimePicker] = useState(false);
    const [showEndTimePicker, setShowEndTimePicker] = useState(false);

    useEffect(() => {
        // 1. CHI SEI TU?
        const userRef = doc(db, "users", auth.currentUser.uid);
        const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
                const userData = docSnap.data();
                setCanSeeMoney(userData.hideMoney !== true);
                setCreatorRole(userData.role);
                const fullName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
                setCreatorName(fullName || "Amministrazione");
            }
        });

// -----------------------------------------------------------
        // 2. CONFIGURAZIONE BANCA (VERSIONE LIVE - FIX CENTESIMI) 🟢
        // -----------------------------------------------------------
        const configRef = doc(db, "settings", "globalConfig");
        
        // Attiviamo l'ascolto in tempo reale
        const unsubscribeConfig = onSnapshot(configRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if(data.defaultRate) {
                    console.log("Prezzo aggiornato live:", data.defaultRate); // Debug
                    setPayoutRate(data.defaultRate); // <--- Questo aggiorna i 10/12 centesimi all'istante!
                    setRateType(data.defaultType || 'hourly');
                    setIsConfigured(true);
                } else {
                    setIsConfigured(false);
                }
            }
            setIsLoadingSettings(false); // Sblocca il caricamento
        }, (error) => {
            console.log("Errore config:", error);
            setIsLoadingSettings(false);
        });

return () => {
            unsubscribeUser();   // (C'era già probabilmente)
            unsubscribeConfig(); // <--- AGGIUNGI QUESTO! Spegne l'ascolto del prezzo
        };
    }, []);

    // FILTRO LISTA PERSONE
    const filteredCollaborators = activeCollaborators.filter(c => {
        if (creatorRole === 'FOUNDER') return true; 
        return c.role === 'COLLABORATORE'; 
    });

    // --- FIX FUSO ORARIO (IMPORTANTE) ---
    // Usiamo l'ora locale (getFullYear, getMonth) invece di toISOString (che usa Londra/UTC)
    const formatDate = (dateObj) => {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

// --- FIX FORMATO ORA ( HH:MM SICURO ) ---
    const formatTime = (dateObj) => {
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    };
    
    const formatRoleLabel = (role) => {
        if (role === 'AMMINISTRATORE') return '(Admin)';
        if (role === 'COLLABORATORE') return '(Staff)';
        return `(${role})`;
    };
    const getRateLabel = () => {
        if(rateType === 'minute') return "AL MINUTO";
        if(rateType === 'daily') return "A GIORNATA";
        return "ALL'ORA";
    };
    // --- FUNZIONI MULTI-SELEZIONE ---
    const toggleCollaborator = (id) => {
        if (selectedCollaborators.includes(id)) {
            // Se c'è già, lo togliamo (filtro)
            setSelectedCollaborators(prev => prev.filter(cId => cId !== id)); 
        } else {
            // Se non c'è, lo aggiungiamo alla lista
            setSelectedCollaborators(prev => [...prev, id]); 
        }
    };

    const toggleSelectAll = () => {
        // Se sono tutti selezionati, svuota tutto. Altrimenti seleziona tutti.
        if (selectedCollaborators.length === filteredCollaborators.length) {
            setSelectedCollaborators([]); 
        } else {
            setSelectedCollaborators(filteredCollaborators.map(c => c.id)); 
        }
    };

// --- FUNZIONE DI SALVATAGGIO "MITRAGLIATRICE" ---
    const handleSave = async () => {
        const showAlert = (title, msg) => {
            if (Platform.OS === 'web') alert(`${title}: ${msg}`);
            else Alert.alert(title, msg);
        };

        // 1. Validazione: Controlliamo se la lista è vuota
        if (selectedCollaborators.length === 0 || !location) { 
            showAlert("Mancano dati", "Seleziona almeno un collaboratore e inserisci il luogo."); 
            return; 
        }
        
        // 2. Validazione Soldi
        const safeRate = parseFloat(payoutRate);
        if (!isConfigured || isNaN(safeRate) || safeRate === 0) { 
            showAlert("Blocco Banca", "Tariffa non valida. Controlla le impostazioni."); 
            return; 
        }

        // 3. Controllo Orario
        const combinedStart = new Date(
            date.getFullYear(), date.getMonth(), date.getDate(),
            startTime.getHours(), startTime.getMinutes()
        );

        const now = new Date();
        if (combinedStart < new Date(now.getTime() - 60000)) {
            showAlert("Orario non valido", "Non puoi assegnare un turno nel passato.");
            return; 
        }

        setLoading(true);
        try {
            // --- CICLO DI CREAZIONE MULTIPLO ---
            // Prepariamo tutte le creazioni in memoria
            const createShiftPromises = selectedCollaborators.map(async (collabId) => {
                const collabData = activeCollaborators.find(c => c.id === collabId);
                const collabName = collabData ? `${collabData.firstName} ${collabData.lastName}` : "Sconosciuto";
                const collabRole = collabData ? collabData.role : 'COLLABORATORE';

                const shiftData = {
                    collaboratorId: collabId,
                    collaboratorName: collabName,
                    collaboratorRole: collabRole,
                    location: location,
                    date: formatDate(date),
                    startTime: formatTime(startTime),
                    endTime: formatTime(endTime),
                    payoutRate: safeRate,
                    rateType: rateType,     
                    status: 'assegnato',     
                    createdBy: auth.currentUser.uid,
                    creatorName: creatorName,
                    createdAt: new Date().toISOString()
                };

                // Salvataggio effettivo
                await addDoc(collection(db, "shifts"), shiftData);

                // Notifica Push
                if (collabData && collabData.expoPushToken) {
                    await sendPushNotification(collabData.expoPushToken, "📅 Nuovo Turno", `Turno a ${location} il ${formatDate(date)}.`);
                }
            });

            // Eseguiamo tutto insieme
            await Promise.all(createShiftPromises);

            showAlert("SUCCESSO 🚀", `${selectedCollaborators.length} Turni assegnati correttamente!`);
            
            // --- NON TORNA INDIETRO (navigation.goBack rimosso) ---
            setSelectedCollaborators([]); // Pulisce solo i nomi selezionati
            // Location e orari restano lì per il prossimo inserimento

        } catch (error) { 
            console.error("ERRORE SALVATAGGIO:", error);
            showAlert("Errore", "Impossibile salvare i turni: " + error.message); 
        } 
        finally { setLoading(false); }
    };

    // Callback per Mobile Pickers
    const onDateChange = (event, selectedDate) => { setShowDatePicker(false); if(selectedDate) setDate(selectedDate); };
    const onStartTimeChange = (event, selectedDate) => { setShowStartTimePicker(false); if(selectedDate) setStartTime(selectedDate); };
    const onEndTimeChange = (event, selectedDate) => { setShowEndTimePicker(false); if(selectedDate) setEndTime(selectedDate); };

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}><Feather name="arrow-left" size={24} color={Colors.textPrimary} /></TouchableOpacity>
                <Text style={styles.headerTitle}>Nuovo Turno</Text>
                <View style={{width:24}}/>
            </View>

            {isLoadingSettings ? <ActivityIndicator style={{marginTop:100}} color={Colors.primary} size="large" /> :
            <ScrollView contentContainerStyle={styles.content}>

{/* --- SEZIONE 1: SCELTA PERSONE (MULTI) --- */}
                <View style={styles.sectionCard}>
                    <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15}}>
                        <View style={{flexDirection:'row', alignItems:'center'}}>
                            <Feather name="users" size={18} color={Colors.accent} />
                            <Text style={styles.sectionTitle}>SQUADRA ({selectedCollaborators.length})</Text>
                        </View>
                        <TouchableOpacity onPress={toggleSelectAll}>
                            <Text style={{color: Colors.accent, fontWeight:'bold', fontSize:12}}>
                                {selectedCollaborators.length === filteredCollaborators.length ? "DESELEZIONA" : "TUTTI"}
                            </Text>
                        </TouchableOpacity>
                    </View>
                    
                    {/* SCROLLVIEW PER LA LISTA NOMI CON SPUNTE */}
                    <View style={styles.listContainer}>
                        <ScrollView nestedScrollEnabled={true} style={{maxHeight: 250}}>
                            {filteredCollaborators.map((collab) => {
                                // Controlliamo se questo specifico tizio è nella lista dei selezionati
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

                    {creatorRole !== 'FOUNDER' && (
                        <Text style={{color: Colors.textSecondary, fontSize: 10, marginTop: 8, fontStyle:'italic'}}>
                            * Seleziona più persone per creare lo stesso turno a tutti.
                        </Text>
                    )}
                </View>

                {/* --- SEZIONE 2: LUOGO E ORA (CON FIX DATA E FIX HTML WEB) --- */}
                <View style={styles.sectionCard}>
                    <View style={styles.sectionHeader}><Feather name="map-pin" size={18} color={Colors.yellow} /><Text style={[styles.sectionTitle, {color: Colors.yellow}]}>LOCATION & ORARI</Text></View>
                    <TextInput style={styles.input} placeholder="Luogo o Evento" placeholderTextColor={Colors.textSecondary} value={location} onChangeText={setLocation} />
                    <View style={styles.divider}/>

                    {/* --- DATA --- */}
                    <Text style={[styles.smallLabel, {marginBottom:5}]}>DATA EVENTO</Text>
                    {Platform.OS === 'web' ? (
                        // WEB: HTML INPUT DATE (Bianco) - Fix cliccabilità PC
                        <View style={{height: 50, marginBottom: 15}}>
                            <input 
                                type="date"
                                value={formatDate(date)} // Usa la nuova funzione locale!
                                onChange={(e) => setDate(new Date(e.target.value))}
                                style={{
                                    width: '100%', height: '100%',
                                    backgroundColor: 'white', color: 'black',
                                    borderRadius: '10px', border: '1px solid #333',
                                    padding: '10px', fontSize: '16px'
                                }}
                            />
                        </View>
                    ) : (
                        // MOBILE: REACT NATIVE PICKER
                        <>
                            <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.dateButton}>
                                <Feather name="calendar" size={20} color={Colors.textPrimary} />
                                <Text style={styles.dateText}>{formatDate(date)}</Text>
                            </TouchableOpacity>
                            {showDatePicker && (
                                <DateTimePicker value={date} mode="date" display="default" onChange={onDateChange} minimumDate={new Date()} />
                            )}
                        </>
                    )}

                    {/* --- ORARI --- */}
                    <View style={styles.row}>
                        {/* INIZIO */}
                        <View style={{flex:1, marginRight:10}}>
                            <Text style={[styles.smallLabel, {marginBottom:5}]}>INIZIO</Text>
                            {Platform.OS === 'web' ? (
                                // WEB: HTML INPUT TIME
                                <View style={{height: 50}}>
                                    <input 
                                        type="time"
                                        value={startTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false})}
                                        onChange={(e) => {
                                            if(!e.target.value) return;
                                            const [h, m] = e.target.value.split(':');
                                            const newTime = new Date(startTime);
                                            newTime.setHours(h); newTime.setMinutes(m);
                                            setStartTime(newTime);
                                        }}
                                        style={{
                                            width: '100%', height: '100%',
                                            backgroundColor: 'white', color: 'black',
                                            borderRadius: '10px', border: '1px solid #333',
                                            padding: '10px', fontSize: '16px'
                                        }}
                                    />
                                </View>
                            ) : (
                                // MOBILE
                                <>
                                    <TouchableOpacity onPress={() => setShowStartTimePicker(true)} style={styles.timeButton}>
                                        <Text style={styles.timeText}>{formatTime(startTime)}</Text>
                                    </TouchableOpacity>
                                    {showStartTimePicker && <DateTimePicker value={startTime} mode="time" is24Hour={true} display="default" onChange={onStartTimeChange} />}
                                </>
                            )}
                        </View>

                        {/* FINE */}
                        <View style={{flex:1, marginLeft:10}}>
                            <Text style={[styles.smallLabel, {marginBottom:5}]}>FINE</Text>
                            {Platform.OS === 'web' ? (
                                // WEB: HTML INPUT TIME
                                <View style={{height: 50}}>
                                    <input 
                                        type="time"
                                        value={endTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false})}
                                        onChange={(e) => {
                                            if(!e.target.value) return;
                                            const [h, m] = e.target.value.split(':');
                                            const newTime = new Date(endTime);
                                            newTime.setHours(h); newTime.setMinutes(m);
                                            setEndTime(newTime);
                                        }}
                                        style={{
                                            width: '100%', height: '100%',
                                            backgroundColor: 'white', color: 'black',
                                            borderRadius: '10px', border: '1px solid #333',
                                            padding: '10px', fontSize: '16px'
                                        }}
                                    />
                                </View>
                            ) : (
                                // MOBILE
                                <>
                                    <TouchableOpacity onPress={() => setShowEndTimePicker(true)} style={styles.timeButton}>
                                        <Text style={styles.timeText}>{formatTime(endTime)}</Text>
                                    </TouchableOpacity>
                                    {showEndTimePicker && <DateTimePicker value={endTime} mode="time" is24Hour={true} display="default" onChange={onEndTimeChange} />}
                                </>
                            )}
                        </View>
                    </View>
                </View>

                {/* --- SEZIONE 3: SOLDI --- */}
                {canSeeMoney ? (
                    <View style={[styles.sectionCard, {borderColor: isConfigured ? Colors.primary : Colors.error, borderWidth:1}]}>
                        <View style={styles.sectionHeader}>
                            <Feather name={isConfigured ? "lock" : "alert-triangle"} size={18} color={isConfigured ? Colors.primary : Colors.error} />
                            <Text style={[styles.sectionTitle, {color: isConfigured ? Colors.primary : Colors.error}]}>
                                {isConfigured ? "TARIFFA APPLICATA (AUTO)" : "CONFIGURAZIONE MANCANTE"}
                            </Text>
                        </View>
                        {isConfigured ? (
                            <View style={{flexDirection:'row', alignItems:'flex-end', marginTop: 5}}>
                                <Text style={{color:Colors.textPrimary, fontSize:32, fontWeight:'bold', marginRight:10}}>€ {payoutRate}</Text>
                                <Text style={{color:Colors.textSecondary, fontSize:14, fontWeight:'bold', marginBottom:6, textTransform:'uppercase'}}>{getRateLabel()}</Text>
                            </View>
                        ) : (
                            <Text style={{color:Colors.textSecondary, fontSize:13, fontStyle:'italic'}}>Banca Centrale non configurata.</Text>
                        )}
                    </View>
                ) : (
                    <View style={[styles.sectionCard, {borderColor: Colors.yellow, borderWidth:1, opacity: 0.8}]}>
                        <View style={styles.sectionHeader}>
                            <Feather name="eye-off" size={18} color={Colors.yellow} />
                            <Text style={[styles.sectionTitle, {color: Colors.yellow}]}>TARIFFA PROTETTA</Text>
                        </View>
                        <View style={{marginTop: 5}}>
                            <Text style={{color:Colors.textSecondary, fontSize:14, fontStyle:'italic'}}>L'importo è gestito automaticamente dal sistema.</Text>
                            <Text style={{color:Colors.yellow, fontSize:16, fontWeight:'bold', marginTop:5}}>VISIBILITÀ NASCOSTA</Text>
                        </View>
                    </View>
                )}

                <TouchableOpacity style={[styles.saveButton, !isConfigured && {backgroundColor: Colors.border, opacity:0.5}]} onPress={handleSave} disabled={loading || !isConfigured}>
                    {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.saveButtonText}>{isConfigured ? "CONFERMA E ASSEGNA" : "BLOCCATO"}</Text>}
                </TouchableOpacity>

            </ScrollView>}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: Colors.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary },
    content: { padding: 20, paddingBottom: 50 },
    sectionCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: Colors.border },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
    sectionTitle: { color: Colors.textSecondary, fontSize: 12, fontWeight: '900', marginLeft: 10, letterSpacing: 1 },
    pickerWrapper: { backgroundColor: '#000', borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
    input: { backgroundColor: '#000', color: Colors.textPrimary, padding: 15, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, fontSize: 16 },
    divider: { height: 1, backgroundColor: Colors.border, marginVertical: 15 },
    dateButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#000', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: 15 },
    dateText: { color: Colors.textPrimary, fontSize: 16, fontWeight: 'bold', marginLeft: 10 },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    smallLabel: { color: Colors.textSecondary, fontSize: 10, fontWeight: 'bold', marginBottom: 5 },
    timeButton: { backgroundColor: '#000', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems:'center' },
    timeText: { color: Colors.textPrimary, fontSize: 18, fontWeight: 'bold' },
    saveButton: { backgroundColor: Colors.primary, padding: 20, borderRadius: 16, alignItems: 'center', marginTop: 10, elevation: 5 },
    saveButtonText: { color: '#000', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
    listContainer: { backgroundColor: '#000', borderRadius: 10, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
    collabItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
    collabItemSelected: { backgroundColor: Colors.success + '20' },
    collabName: { color: Colors.textSecondary, fontSize: 14 },
});
