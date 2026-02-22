// CreateShiftScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, SafeAreaView, Platform, StatusBar, Alert, ActivityIndicator, Switch } from 'react-native';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { db, auth } from './firebaseConfig';
import { collection, addDoc, doc, onSnapshot } from 'firebase/firestore';
import { sendPushNotification } from './Notifiche';

const Colors = {
    background: '#000000', surface: '#1C1C1E', textPrimary: '#FFFFFF', textSecondary: '#8E8E93',
    primary: '#4CAF50', accent: '#0A84FF', error: '#FF453A', border: '#2C2C2E',
    yellow: '#EAB308', purple: '#A371F7', hidden: '#333', orange: '#F97316'
};

export default function CreateShiftScreen({ navigation, route }) {
    const { activeCollaborators } = route.params || { activeCollaborators: [] };

    const [selectedCollaborators, setSelectedCollaborators] = useState([]);
    const [location, setLocation] = useState('');
    
    // Date e Orari Turno
    const [date, setDate] = useState(new Date());
    const [startTime, setStartTime] = useState(new Date());
    const [endTime, setEndTime] = useState(new Date(new Date().getTime() + 3600000)); // +1 ora default

    // --- NUOVA GESTIONE PAUSA ⏸️ ---
    const [hasBreak, setHasBreak] = useState(false);
    const [breakStartTime, setBreakStartTime] = useState(new Date());
    const [breakEndTime, setBreakEndTime] = useState(new Date(new Date().getTime() + 1800000)); // +30 min default

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
    
    // Popup per Pausa (Mobile)
    const [showBreakStartPicker, setShowBreakStartPicker] = useState(false);
    const [showBreakEndPicker, setShowBreakEndPicker] = useState(false);

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

        // 2. CONFIGURAZIONE BANCA
        const configRef = doc(db, "settings", "globalConfig");
        const unsubscribeConfig = onSnapshot(configRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if(data.defaultRate) {
                    setPayoutRate(data.defaultRate); 
                    setRateType(data.defaultType || 'hourly');
                    setIsConfigured(true);
                } else {
                    setIsConfigured(false);
                }
            }
            setIsLoadingSettings(false);
        }, (error) => {
            console.log("Errore config:", error);
            setIsLoadingSettings(false);
        });

        return () => {
            unsubscribeUser();
            unsubscribeConfig();
        };
    }, []);

// FILTRO LISTA PERSONE (CON BLOCCO AUTO-ASSEGNAZIONE ⛔)
    const filteredCollaborators = activeCollaborators.filter(c => {
        // 1. Regola Base: Non mostrare MAI me stesso
        if (c.id === auth.currentUser.uid) return false;
        // 2. Regole Ruoli
        if (creatorRole === 'FOUNDER') return true; 
        return c.role === 'COLLABORATORE'; 
    });

    const formatDate = (dateObj) => {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

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
            setSelectedCollaborators(prev => prev.filter(cId => cId !== id)); 
        } else {
            setSelectedCollaborators(prev => [...prev, id]); 
        }
    };

    const toggleSelectAll = () => {
        if (selectedCollaborators.length === filteredCollaborators.length) {
            setSelectedCollaborators([]); 
        } else {
            setSelectedCollaborators(filteredCollaborators.map(c => c.id)); 
        }
    };

    // --- FUNZIONE DI SALVATAGGIO ---
    const handleSave = async () => {
        const showAlert = (title, msg) => {
            if (Platform.OS === 'web') alert(`${title}: ${msg}`);
            else Alert.alert(title, msg);
        };

        // 1. Validazione Base
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

        // 4. Validazione Pausa (Se attiva)
        if (hasBreak) {
            // Qui potremmo aggiungere controlli, tipo che la pausa non sia più lunga del turno
            // Ma per ora lasciamo flessibilità.
        }

        // 🛡️ 4. BLOCCO SICUREZZA PAUSA (NUOVO)
        if (hasBreak) {
            // Costruiamo le date complete per la Pausa
            let bStartObj = new Date(date.getFullYear(), date.getMonth(), date.getDate(), breakStartTime.getHours(), breakStartTime.getMinutes());
            let bEndObj = new Date(date.getFullYear(), date.getMonth(), date.getDate(), breakEndTime.getHours(), breakEndTime.getMinutes());
            
            // Costruiamo le date complete per il Turno (per confronto preciso)
            let shiftStartObj = new Date(date.getFullYear(), date.getMonth(), date.getDate(), startTime.getHours(), startTime.getMinutes());
            let shiftEndObj = new Date(date.getFullYear(), date.getMonth(), date.getDate(), endTime.getHours(), endTime.getMinutes());

            // GESTIONE NOTTE (Se scavalca la mezzanotte)
            if (shiftEndObj < shiftStartObj) shiftEndObj.setDate(shiftEndObj.getDate() + 1);
            if (bEndObj < bStartObj) bEndObj.setDate(bEndObj.getDate() + 1);

            // Allineamento Pausa se il turno scavalca la notte
            if (shiftStartObj.getDate() !== shiftEndObj.getDate()) {
                // Se la pausa è di mattina (es. 02:00) ma il turno iniziava ieri sera (es. 22:00)
                if (bStartObj.getHours() < 12 && shiftStartObj.getHours() > 12) {
                    bStartObj.setDate(bStartObj.getDate() + 1);
                    bEndObj.setDate(bEndObj.getDate() + 1);
                }
            }

            // IL CONTROLLO REALE 👮‍♂️
            // 1. Pausa inizia PRIMA del turno?
            // 2. Pausa finisce DOPO il turno?
            if (bStartObj < shiftStartObj || bEndObj > shiftEndObj) {
                showAlert("Errore Pausa ⚠️", "La pausa deve essere INTERNA al turno.\nControlla gli orari.");
                return; // ⛔ STOP
            }
        }

        setLoading(true);
        try {
            // --- CICLO DI CREAZIONE MULTIPLO ---
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
                    
                    // --- DATI PAUSA ---
                    hasBreak: hasBreak,
                    breakStartTime: hasBreak ? formatTime(breakStartTime) : null,
                    breakEndTime: hasBreak ? formatTime(breakEndTime) : null,
                    // ------------------

                    payoutRate: safeRate,
                    rateType: rateType,     
                    status: 'assegnato',     
                    createdBy: auth.currentUser.uid,
                    creatorName: creatorName,
                    createdAt: new Date().toISOString()
                };

                await addDoc(collection(db, "shifts"), shiftData);

                // Notifica Push
                if (collabData && collabData.expoPushToken) {
                    const messageBody = `Sei stato convocato per un turno a ${location} il ${formatDate(date)}. Entra e CONFERMA la presenza!`;
                    await sendPushNotification(collabData.expoPushToken, "🚨 NUOVA CONVOCAZIONE", messageBody);
                }
            });

            await Promise.all(createShiftPromises);

            showAlert("SUCCESSO 🚀", `${selectedCollaborators.length} Turni assegnati correttamente!`);
            setSelectedCollaborators([]); 

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
    
    // Callback Pausa
    const onBreakStartChange = (event, selectedDate) => { setShowBreakStartPicker(false); if(selectedDate) setBreakStartTime(selectedDate); };
    const onBreakEndChange = (event, selectedDate) => { setShowBreakEndPicker(false); if(selectedDate) setBreakEndTime(selectedDate); };

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
                            <Text style={styles.sectionTitle}>SELEZIONATI ({selectedCollaborators.length})</Text>
                        </View>
                        <TouchableOpacity onPress={toggleSelectAll}>
                            <Text style={{color: Colors.accent, fontWeight:'bold', fontSize:12}}>
                                {selectedCollaborators.length === filteredCollaborators.length ? "DESELEZIONA" : "TUTTI"}
                            </Text>
                        </TouchableOpacity>
                    </View>
                    
                    <View style={styles.listContainer}>
                        <ScrollView nestedScrollEnabled={true} style={{maxHeight: 250}}>
                            {filteredCollaborators.map((collab) => {
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

                {/* --- SEZIONE 2: LUOGO E ORA --- */}
                <View style={styles.sectionCard}>
                    <View style={styles.sectionHeader}><Feather name="map-pin" size={18} color={Colors.yellow} /><Text style={[styles.sectionTitle, {color: Colors.yellow}]}>LOCATION & ORARI</Text></View>
                    <TextInput style={styles.input} placeholder="Luogo o Evento" placeholderTextColor={Colors.textSecondary} value={location} onChangeText={setLocation} />
                    <View style={styles.divider}/>

                    {/* --- DATA --- */}
                    <Text style={[styles.smallLabel, {marginBottom:5}]}>DATA EVENTO</Text>
                    {Platform.OS === 'web' ? (
                        <View style={{height: 50, marginBottom: 15}}>
                            <input 
                                type="date"
                                value={formatDate(date)} 
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

                    {/* --- ORARI TURNO --- */}
                    <View style={styles.row}>
                        <View style={{flex:1, marginRight:10}}>
                            <Text style={[styles.smallLabel, {marginBottom:5}]}>INIZIO TURNO</Text>
                            {Platform.OS === 'web' ? (
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
                                        style={{width: '100%', height: '100%', backgroundColor: 'white', color: 'black', borderRadius: '10px', border: '1px solid #333', padding: '10px', fontSize: '16px'}}
                                    />
                                </View>
                            ) : (
                                <>
                                    <TouchableOpacity onPress={() => setShowStartTimePicker(true)} style={styles.timeButton}>
                                        <Text style={styles.timeText}>{formatTime(startTime)}</Text>
                                    </TouchableOpacity>
                                    {showStartTimePicker && <DateTimePicker value={startTime} mode="time" is24Hour={true} display="default" onChange={onStartTimeChange} />}
                                </>
                            )}
                        </View>

                        <View style={{flex:1, marginLeft:10}}>
                            <Text style={[styles.smallLabel, {marginBottom:5}]}>FINE TURNO</Text>
                            {Platform.OS === 'web' ? (
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
                                        style={{width: '100%', height: '100%', backgroundColor: 'white', color: 'black', borderRadius: '10px', border: '1px solid #333', padding: '10px', fontSize: '16px'}}
                                    />
                                </View>
                            ) : (
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

                {/* --- SEZIONE 3: PAUSA ⏸️ (NUOVA) --- */}
                <View style={[styles.sectionCard, {borderColor: Colors.orange}]}>
                    <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                        <View style={{flexDirection:'row', alignItems:'center'}}>
                            <Feather name="coffee" size={18} color={Colors.orange} />
                            <Text style={[styles.sectionTitle, {color: Colors.orange}]}>PAUSA PRANZO / CENA</Text>
                        </View>
                        <Switch 
                            value={hasBreak} 
                            onValueChange={setHasBreak}
                            trackColor={{ false: "#767577", true: Colors.orange }}
                            thumbColor={hasBreak ? "#FFF" : "#f4f3f4"}
                        />
                    </View>

                    {hasBreak && (
                        <View style={{marginTop: 15}}>
                            <View style={styles.divider}/>
                            <View style={styles.row}>
                                {/* INIZIO PAUSA */}
                                <View style={{flex:1, marginRight:10}}>
                                    <Text style={[styles.smallLabel, {marginBottom:5, color:Colors.orange}]}>INIZIO PAUSA</Text>
                                    {Platform.OS === 'web' ? (
                                        <View style={{height: 50}}>
                                            <input 
                                                type="time"
                                                value={breakStartTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false})}
                                                onChange={(e) => {
                                                    if(!e.target.value) return;
                                                    const [h, m] = e.target.value.split(':');
                                                    const newTime = new Date(breakStartTime);
                                                    newTime.setHours(h); newTime.setMinutes(m);
                                                    setBreakStartTime(newTime);
                                                }}
                                                style={{width: '100%', height: '100%', backgroundColor: '#fff7ed', color: 'black', borderRadius: '10px', border: '1px solid orange', padding: '10px', fontSize: '16px'}}
                                            />
                                        </View>
                                    ) : (
                                        <>
                                            <TouchableOpacity onPress={() => setShowBreakStartPicker(true)} style={[styles.timeButton, {borderColor: Colors.orange}]}>
                                                <Text style={[styles.timeText, {color:Colors.orange}]}>{formatTime(breakStartTime)}</Text>
                                            </TouchableOpacity>
                                            {showBreakStartPicker && <DateTimePicker value={breakStartTime} mode="time" is24Hour={true} display="default" onChange={onBreakStartChange} />}
                                        </>
                                    )}
                                </View>

                                {/* FINE PAUSA */}
                                <View style={{flex:1, marginLeft:10}}>
                                    <Text style={[styles.smallLabel, {marginBottom:5, color:Colors.orange}]}>FINE PAUSA</Text>
                                    {Platform.OS === 'web' ? (
                                        <View style={{height: 50}}>
                                            <input 
                                                type="time"
                                                value={breakEndTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false})}
                                                onChange={(e) => {
                                                    if(!e.target.value) return;
                                                    const [h, m] = e.target.value.split(':');
                                                    const newTime = new Date(breakEndTime);
                                                    newTime.setHours(h); newTime.setMinutes(m);
                                                    setBreakEndTime(newTime);
                                                }}
                                                style={{width: '100%', height: '100%', backgroundColor: '#fff7ed', color: 'black', borderRadius: '10px', border: '1px solid orange', padding: '10px', fontSize: '16px'}}
                                            />
                                        </View>
                                    ) : (
                                        <>
                                            <TouchableOpacity onPress={() => setShowBreakEndPicker(true)} style={[styles.timeButton, {borderColor: Colors.orange}]}>
                                                <Text style={[styles.timeText, {color:Colors.orange}]}>{formatTime(breakEndTime)}</Text>
                                            </TouchableOpacity>
                                            {showBreakEndPicker && <DateTimePicker value={breakEndTime} mode="time" is24Hour={true} display="default" onChange={onBreakEndChange} />}
                                        </>
                                    )}
                                </View>
                            </View>
                        </View>
                    )}
                </View>

                {/* --- SEZIONE 4: SOLDI --- */}
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
