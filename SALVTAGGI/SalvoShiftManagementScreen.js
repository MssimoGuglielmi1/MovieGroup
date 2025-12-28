import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, FlatList, StatusBar, Platform, Alert, Linking, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { db, auth } from './firebaseConfig';
import { doc, deleteDoc, updateDoc, collection, query, onSnapshot, getDoc } from 'firebase/firestore';
import * as Location from 'expo-location'; // IMPORTANTE: Serve per il Check-in GPS

const Colors = {
    background: '#000000', surface: '#1C1C1E', textPrimary: '#FFFFFF', textSecondary: '#8E8E93',
    primary: '#4CAF50', accent: '#0A84FF', error: '#FF453A', purple: '#A371F7',
    gold: '#EAB308', border: '#2C2C2E', success: '#34C759'
};

export default function ShiftManagementScreen({ navigation }) {
    const [allShifts, setAllShifts] = useState([]);
    const [currentTab, setCurrentTab] = useState('PENDING'); // PENDING | PROGRAM | HISTORY
    const [loadingAction, setLoadingAction] = useState(false); // Spinner per azioni
    const currentUserId = auth.currentUser ? auth.currentUser.uid : null;

    // --- FUNZIONI DI UTILITÀ ---
    const getShiftDateTime = (dateStr, timeStr) => {
        if(!dateStr || !timeStr) return new Date();
        const [year, month, day] = dateStr.split('-').map(Number);
        const [hours, minutes] = timeStr.split(':').map(Number);
        return new Date(year, month - 1, day, hours, minutes, 0);
    };

    useEffect(() => {
        const q = query(collection(db, "shifts"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let liveData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // --- FILTRO: Mostro tutto, ma l'utente vedrà i bottoni solo sui SUOI turni ---
            // Se vuoi che il Founder veda tutto, non filtrare nulla qui.
            // Se vuoi che lo Staff veda SOLO i suoi, scommenta sotto:
            /*
            if (currentUserId) {
                 // Opzionale: Staff vede solo i suoi, Admin vede tutto?
                 // Per ora lasciamo che tutti vedano tutto ma possano agire solo sui propri.
            }
            */

            // LOGICA SPAZZINO (Auto-chiusura turni dimenticati aperti)
            const now = new Date();
            liveData.forEach(async (shift) => {
                if (shift.status === 'in-corso') {
                    const endDate = getShiftDateTime(shift.date, shift.endTime);
                    const closureTime = new Date(endDate.getTime() + 15 * 60000); // +15 min buffer
                    if (now > closureTime) {
                        try {
                            await updateDoc(doc(db, "shifts", shift.id), {
                                status: 'completato',
                                realEndTime: endDate.toISOString()
                            });
                        } catch (error) { console.error("Errore auto-chiusura:", error); }
                    }
                }
            });

            liveData.sort((a, b) => new Date(b.date) - new Date(a.date));
            setAllShifts(liveData);
        });
        return () => unsubscribe();
    }, []);

    // --- AZIONI OPERATIVE (STAFF) ---

    // 1. ACCETTA TURNO
    const handleAccept = async (shiftId) => {
        setLoadingAction(true);
        try {
            await updateDoc(doc(db, "shifts", shiftId), { status: 'accettato' });
            Alert.alert("Confermato", "Hai accettato il turno. Sii puntuale!");
        } catch (e) { Alert.alert("Errore", e.message); }
        finally { setLoadingAction(false); }
    };

    // 2. RIFIUTA TURNO
    const handleReject = async (shiftId) => {
        Alert.alert("Rifiuta Turno", "Sei sicuro di non poter coprire questo turno?", [
            { text: "Annulla", style: "cancel" },
            { 
                text: "Rifiuta", style: "destructive", 
                onPress: async () => {
                    try { await updateDoc(doc(db, "shifts", shiftId), { status: 'rifiutato' }); }
                    catch (e) { Alert.alert("Errore", e.message); }
                }
            }
        ]);
    };

    // 3. CHECK-IN (INIZIA TURNO) + GPS
    const handleCheckIn = async (shiftId) => {
        setLoadingAction(true);
        try {
            // Chiedi permesso GPS
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert("Permesso Negato", "Serve il GPS per confermare che sei sul posto.");
                setLoadingAction(false);
                return;
            }

            let location = await Location.getCurrentPositionAsync({});
            const gpsCoords = {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude
            };

            await updateDoc(doc(db, "shifts", shiftId), {
                status: 'in-corso',
                realStartTime: new Date().toISOString(),
                startLocation: gpsCoords // Salviamo la posizione
            });
            Alert.alert("Buon Lavoro!", "Turno iniziato. La tua posizione è stata registrata.");
        } catch (e) { 
            Alert.alert("Errore Check-in", "Impossibile verificare la posizione. Riprova."); 
        } finally { setLoadingAction(false); }
    };

    // 4. TERMINA TURNO
    const handleEndShift = async (shiftId) => {
        Alert.alert("Termina Turno", "Hai finito il lavoro?", [
            { text: "No", style: "cancel" },
            { 
                text: "Sì, Termina", 
                onPress: async () => {
                    setLoadingAction(true);
                    try {
                        await updateDoc(doc(db, "shifts", shiftId), {
                            status: 'completato',
                            realEndTime: new Date().toISOString()
                        });
                        Alert.alert("Finito!", "Turno chiuso correttamente.");
                    } catch (e) { Alert.alert("Errore", e.message); }
                    finally { setLoadingAction(false); }
                }
            }
        ]);
    };

    // --- AZIONI AMMINISTRATIVE (ADMIN) ---
    const handleAdminDelete = async (shift) => {
        Alert.alert("Elimina Turno", "Cancellare definitivamente?", [
            { text: "No" }, { text: "Sì", style:'destructive', onPress: async () => await deleteDoc(doc(db, "shifts", shift.id)) }
        ]);
    };

    const handleOpenMap = (item) => {
        if (item.startLocation && item.startLocation.latitude) {
            const { latitude, longitude } = item.startLocation;
            const label = encodeURIComponent(`Posizione di ${item.collaboratorName}`);
            const url = Platform.select({
                ios: `maps:0,0?q=${label}@${latitude},${longitude}`,
                android: `geo:0,0?q=${latitude},${longitude}(${label})`
            });
            Linking.openURL(url).catch(() => Alert.alert("Errore", "Impossibile aprire le mappe."));
        } else {
            Alert.alert("No GPS", "Posizione non registrata.");
        }
    };

    // --- FILTRI STATO ---
    const isPendingStatus = (s) => ['assegnato', 'pending'].includes((s||'').toLowerCase());
    const isActiveStatus = (s) => ['accettato', 'in-corso', 'confirmed'].includes((s||'').toLowerCase());
    const isHistoryStatus = (s) => ['completato', 'rifiutato', 'rejected'].includes((s||'').toLowerCase());

    const shiftsPending = allShifts.filter(s => isPendingStatus(s.status));
    const shiftsActive = allShifts.filter(s => isActiveStatus(s.status));
    const shiftsHistory = allShifts.filter(s => isHistoryStatus(s.status));

    // --- RENDER ITEM ---
    const renderShiftItem = ({ item }) => {
        const isMyShift = item.collaboratorId === currentUserId; // È il MIO turno?
        const statusLower = (item.status || '').toLowerCase();

        // 1. VISTA STORICO (Passato)
        if (currentTab === 'HISTORY') {
            return (
                <View style={[styles.card, { opacity: 0.6, borderColor: Colors.border }]}>
                    <View style={styles.cardHeader}>
                        <Text style={[styles.locationText, { color: Colors.textSecondary }]}>{item.location}</Text>
                        <View style={[styles.badge, { backgroundColor: Colors.border }]}>
                            <Text style={[styles.badgeText, { color: Colors.textSecondary }]}>{item.status.toUpperCase()}</Text>
                        </View>
                    </View>
                    <Text style={{ color: Colors.textSecondary }}>📅 {item.date} • {item.startTime}-{item.endTime}</Text>
                    <Text style={{ color: Colors.textSecondary }}>👤 {item.collaboratorName}</Text>
                </View>
            );
        }

        // 2. VISTA ATTIVA & PENDING (Con Azioni)
        return (
            <View style={[styles.card, statusLower === 'in-corso' && {borderColor: Colors.success, borderWidth:2}]}>
                <View style={styles.cardHeader}>
                    <Text style={styles.locationText}>{item.location}</Text>
                    <View style={[styles.badge, { backgroundColor: statusLower==='in-corso' ? Colors.success : Colors.accent }]}>
                        <Text style={[styles.badgeText, {color: '#FFF'}]}>{item.status.toUpperCase()}</Text>
                    </View>
                </View>
                
                <Text style={styles.timeText}>📅 {item.date} • ⏰ {item.startTime} - {item.endTime}</Text>
                <Text style={styles.roleText}>👤 {item.collaboratorName} {isMyShift ? "(TU)" : ""}</Text>

                {/* --- SEZIONE BOTTONI OPERATIVI (Solo se è il MIO turno) --- */}
                {isMyShift && (
                    <View style={styles.actionContainer}>
                        
                        {/* CASO 1: ASSEGNATO -> Accetta o Rifiuta */}
                        {statusLower === 'assegnato' && (
                            <View style={{flexDirection:'row', gap:10}}>
                                <TouchableOpacity style={[styles.actionBtn, {backgroundColor: Colors.error}]} onPress={() => handleReject(item.id)}>
                                    <Feather name="x" size={20} color="#FFF" />
                                    <Text style={styles.actionBtnText}>RIFIUTA</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.actionBtn, {backgroundColor: Colors.success}]} onPress={() => handleAccept(item.id)}>
                                    <Feather name="check" size={20} color="#FFF" />
                                    <Text style={styles.actionBtnText}>ACCETTA</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* CASO 2: ACCETTATO -> Check-in GPS */}
                        {statusLower === 'accettato' && (
                            <TouchableOpacity style={[styles.actionBtn, {backgroundColor: Colors.accent}]} onPress={() => handleCheckIn(item.id)}>
                                <Feather name="map-pin" size={20} color="#FFF" />
                                <Text style={styles.actionBtnText}>SONO SUL POSTO (START)</Text>
                            </TouchableOpacity>
                        )}

                        {/* CASO 3: IN CORSO -> Termina */}
                        {statusLower === 'in-corso' && (
                            <TouchableOpacity style={[styles.actionBtn, {backgroundColor: Colors.error}]} onPress={() => handleEndShift(item.id)}>
                                <Feather name="stop-circle" size={20} color="#FFF" />
                                <Text style={styles.actionBtnText}>TERMINA TURNO</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* --- SEZIONE ADMIN (Solo visualizzazione o Delete) --- */}
                {!isMyShift && currentTab === 'PENDING' && (
                    <Text style={{color: Colors.textSecondary, fontSize:10, marginTop:10, fontStyle:'italic'}}>In attesa di risposta dal collaboratore...</Text>
                )}
                
                {!isMyShift && statusLower === 'in-corso' && (
                    <TouchableOpacity style={{marginTop:10, flexDirection:'row', alignItems:'center'}} onPress={() => handleOpenMap(item)}>
                        <Feather name="map" size={14} color={Colors.accent} />
                        <Text style={{color:Colors.accent, fontSize:12, marginLeft:5}}>Vedi Posizione GPS</Text>
                    </TouchableOpacity>
                )}

            </View>
        );
    };

    let dataToShow = currentTab === 'PENDING' ? shiftsPending : (currentTab === 'PROGRAM' ? shiftsActive : shiftsHistory);

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
            
            {/* Header */}
            <View style={styles.headerContainer}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Feather name="arrow-left" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.screenTitle}>GESTIONE TURNI</Text>
                {loadingAction && <ActivityIndicator size="small" color={Colors.accent} style={{marginLeft:10}}/>}
            </View>

            {/* Tabs */}
            <View style={styles.tabContainer}>
                <TouchableOpacity style={[styles.tabButton, currentTab === 'PENDING' && styles.tabActive]} onPress={() => setCurrentTab('PENDING')}>
                    <Text style={[styles.tabText, currentTab === 'PENDING' && styles.tabTextActive]}>DA CONFERMARE</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tabButton, currentTab === 'PROGRAM' && styles.tabActive]} onPress={() => setCurrentTab('PROGRAM')}>
                    <Text style={[styles.tabText, currentTab === 'PROGRAM' && styles.tabTextActive]}>OPERATIVI</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tabButton, currentTab === 'HISTORY' && styles.tabActive]} onPress={() => setCurrentTab('HISTORY')}>
                    <Text style={[styles.tabText, currentTab === 'HISTORY' && styles.tabTextActive]}>STORICO</Text>
                </TouchableOpacity>
            </View>

            {/* Lista */}
            <FlatList
                data={dataToShow}
                keyExtractor={item => item.id}
                renderItem={renderShiftItem}
                contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
                ListEmptyComponent={
                    <View style={{marginTop: 50, alignItems:'center'}}>
                        <Feather name="inbox" size={40} color={Colors.textSecondary} />
                        <Text style={styles.emptyText}>Nessun turno in questa lista.</Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: Colors.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
    headerContainer: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
    backButton: { marginRight: 15 },
    screenTitle: { fontSize: 20, fontWeight: '900', color: Colors.textPrimary, letterSpacing:1 },
    tabContainer: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border },
    tabButton: { flex: 1, paddingVertical: 15, alignItems: 'center' },
    tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.accent },
    tabText: { color: Colors.textSecondary, fontWeight: 'bold', fontSize:11 },
    tabTextActive: { color: Colors.textPrimary },
    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 15, borderWidth: 1, borderColor: Colors.border },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    locationText: { color: Colors.textPrimary, fontSize: 16, fontWeight: 'bold' },
    timeText: { color: Colors.accent, fontSize: 14, marginBottom: 5 },
    roleText: { color: Colors.textSecondary, fontSize: 14 },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
    badgeText: { fontSize: 10, fontWeight: 'bold' },
    emptyText: { color: Colors.textSecondary, textAlign: 'center', marginTop: 10 },
    
    // NUOVI STILI PER AZIONI
    actionContainer: { marginTop: 15, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 8, flex: 1 },
    actionBtnText: { color: '#FFF', fontWeight: 'bold', marginLeft: 8, fontSize: 12 }
});