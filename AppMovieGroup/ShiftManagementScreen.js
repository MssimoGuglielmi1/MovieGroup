//ShiftManagementScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, FlatList, StatusBar, Platform, Alert, Linking, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { db, auth } from './firebaseConfig';
import { doc, deleteDoc, updateDoc, collection, query, onSnapshot, getDoc, where } from 'firebase/firestore'; 
import * as Location from 'expo-location';
import { sendPushNotification } from './Notifiche';

const Colors = {
    background: '#000000', surface: '#1C1C1E', textPrimary: '#FFFFFF', textSecondary: '#8E8E93',
    primary: '#4CAF50', accent: '#0A84FF', error: '#FF453A', purple: '#A371F7',
    gold: '#EAB308', border: '#2C2C2E', success: '#34C759'
};

export default function ShiftManagementScreen({ navigation }) {
    const [allShifts, setAllShifts] = useState([]);
    const [currentTab, setCurrentTab] = useState('PENDING'); 
    const [loadingAction, setLoadingAction] = useState(false);
    const [currentUserRole, setCurrentUserRole] = useState(null); 
    const currentUserId = auth.currentUser ? auth.currentUser.uid : null;

    // Recupera il ruolo dell'utente corrente
    useEffect(() => {
        const fetchRole = async () => {
            if(currentUserId) {
                const u = await getDoc(doc(db, "users", currentUserId));
                if(u.exists()) setCurrentUserRole(u.data().role);
            }
        };
        fetchRole();
    }, [currentUserId]);

    const getShiftDateTime = (dateStr, timeStr) => {
        if(!dateStr || !timeStr) return new Date();
        const [year, month, day] = dateStr.split('-').map(Number);
        const [hours, minutes] = timeStr.split(':').map(Number);
        return new Date(year, month - 1, day, hours, minutes, 0);
    };

    // --- 1. IL BATTITO CARDIACO (Nuovo Orologio) ---
// 1. IL BATTITO: Questo stato cambia ogni secondo
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date()); // Tic-tac
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        // --- FILTRO PRESTAZIONI (ULTIMI 30 GIORNI) ---
        const today = new Date();
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - 60);
        const pastDateStr = pastDate.toISOString().split('T')[0];

        const q = query(
            collection(db, "shifts"),
            where("date", ">=", pastDateStr) // Carica solo roba recente
        );

const unsubscribe = onSnapshot(q, (snapshot) => {
            let liveData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Ordina
            liveData.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            // Salva e basta. NON fare controlli qui.
            setAllShifts(liveData);
        });
        return () => unsubscribe();
    }, []);

    // --- 2. SPAZZINO 4.0 (REAL-TIME) ---
    useEffect(() => {
        const checkAndCloseShifts = () => {
            const now = new Date();

            allShifts.forEach(async (shift) => {
                // Calcolo Data Fine
                let endDate = getShiftDateTime(shift.date, shift.endTime);
                
                // Gestione Notte
                const [startH] = shift.startTime.split(':').map(Number);
                const [endH] = shift.endTime.split(':').map(Number);
                if (endH < startH) endDate.setDate(endDate.getDate() + 1);

                // CASO A: Turno IN CORSO -> Chiudi
                if (shift.status === 'in-corso') {
                    if (now >= endDate) {
                        try {
                            console.log(`⚡ REAL-TIME: Chiusura turno ${shift.id}`);
                            await updateDoc(doc(db, "shifts", shift.id), {
                                status: 'completato',
                                realEndTime: endDate.toISOString(),
                                closedBy: 'SYSTEM_REALTIME'
                            });
                        } catch (e) {}
                    }
                }
                // CASO B: Scaduto
                else if (shift.status === 'assegnato') {
                    const tolerance = new Date(endDate.getTime() + 30 * 60000); 
                    if (now > tolerance) {
                        try {
                            await updateDoc(doc(db, "shifts", shift.id), { status: 'scaduto', note: 'Auto-expire' });
                        } catch (e) {}
                    }
                }
            });
        };
        checkAndCloseShifts();
    }, [currentTime, allShifts]); // <--- Questo fa la magia: scatta ogni secondo!

    // --- AZIONI ---

    // 1. ACCETTA
    const handleAccept = async (shift) => {
        setLoadingAction(true);
        try {
            await updateDoc(doc(db, "shifts", shift.id), { status: 'accettato' });
            if (shift.createdBy) {
                const creatorSnap = await getDoc(doc(db, "users", shift.createdBy));
                if (creatorSnap.exists() && creatorSnap.data().expoPushToken) {
                    await sendPushNotification(creatorSnap.data().expoPushToken, "✅ Turno Accettato", `${shift.collaboratorName} ha confermato il turno.`);
                }
            }
            Alert.alert("Confermato", "Turno accettato.");
        } catch (e) { Alert.alert("Errore", e.message); }
        finally { setLoadingAction(false); }
    };

    // 2. RIFIUTA
    const handleReject = async (shift) => {
        Alert.alert("Rifiuta Turno", "Sei sicuro?", [
            { text: "Annulla", style: "cancel" },
            { 
                text: "Rifiuta", style: "destructive", 
                onPress: async () => {
                    try { 
                        await updateDoc(doc(db, "shifts", shift.id), { status: 'rifiutato' }); 
                        if (shift.createdBy) {
                            const creatorSnap = await getDoc(doc(db, "users", shift.createdBy));
                            if (creatorSnap.exists() && creatorSnap.data().expoPushToken) {
                                await sendPushNotification(creatorSnap.data().expoPushToken, "❌ TURNO RIFIUTATO", `${shift.collaboratorName} non può coprire il turno!`);
                            }
                        }
                    }
                    catch (e) { Alert.alert("Errore", e.message); }
                }
            }
        ]);
    };

    // 3. CHECK-IN
    const handleCheckIn = async (shiftId) => {
        setLoadingAction(true);
        try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') { Alert.alert("Permesso Negato", "Serve il GPS."); setLoadingAction(false); return; }
            let location = await Location.getCurrentPositionAsync({});
            await updateDoc(doc(db, "shifts", shiftId), {
                status: 'in-corso',
                realStartTime: new Date().toISOString(),
                startLocation: { latitude: location.coords.latitude, longitude: location.coords.longitude }
            });
            Alert.alert("Buon Lavoro!", "Turno iniziato.");
        } catch (e) { Alert.alert("Errore Check-in", "Impossibile verificare la posizione."); } 
        finally { setLoadingAction(false); }
    };

    // 4. TERMINA TURNO
// 4. TERMINA TURNO & EMERGENZA (VERSIONE BILINGUE WEB/APP)
    const handleEndShift = async (shift, isForced = false) => {
        const title = isForced ? "ARRESTO EMERGENZA" : "Termina Turno";
        const msg = isForced ? "Vuoi forzare la chiusura immediata del turno?" : "Hai finito il lavoro?";

        // Definiamo la logica di chiusura una volta sola
        const executeClosure = async () => {
            setLoadingAction(true);
            try {
                await updateDoc(doc(db, "shifts", shift.id), {
                    status: 'completato',
                    realEndTime: new Date().toISOString()
                });
                
                if (isForced) {
                   const collabSnap = await getDoc(doc(db, "users", shift.collaboratorId));
                   if (collabSnap.exists() && collabSnap.data().expoPushToken) {
                       await sendPushNotification(collabSnap.data().expoPushToken, "🏁 Turno Concluso", `Il turno a ${shift.location} è stato chiuso amministrativamente.`);
                   }
                }
                
                const successMsg = "Finito! Turno chiuso.";
                if (Platform.OS === 'web') { alert(successMsg); } 
                else { Alert.alert("Finito!", successMsg); }

            } catch (e) { 
                const errorMsg = e.message;
                if (Platform.OS === 'web') { alert("Errore: " + errorMsg); }
                else { Alert.alert("Errore", errorMsg); }
            }
            finally { setLoadingAction(false); }
        };

        // --- BIVIO FONDAMENTALE ---
        if (Platform.OS === 'web') {
            // WEB (PC): Usa il popup del browser
            if (confirm(`${title}: ${msg}`)) {
                executeClosure();
            }
        } else {
            // APP (Telefono): Usa il popup nativo bello
            Alert.alert(title, msg, [
                { text: "No", style: "cancel" },
                { 
                    text: isForced ? "Sì, ARRESTA ORA" : "Sì, Termina", 
                    style: isForced ? 'destructive' : 'default',
                    onPress: executeClosure 
                }
            ]);
        }
    };

// --- FUNZIONE MAPPE UNIVERSALE (Fisso per Web/iPhone/Android) ---
    const handleOpenMap = (item) => {
        if (item.startLocation && item.startLocation.latitude) {
            const { latitude, longitude } = item.startLocation;
            
            // 1. Link sicuro per il Web (Google Maps standard)
            const webUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

            if (Platform.OS === 'web') {
                // SU PC/WEB: Apri una nuova scheda del browser (Sicuro al 100%)
                window.open(webUrl, '_blank');
            } else {
                // SU TELEFONO (App): Usa i comandi nativi
                const label = encodeURIComponent(`Posizione di ${item.collaboratorName}`);
                
                const url = Platform.select({
                    ios: `maps:0,0?q=${label}@${latitude},${longitude}`, // Apple Maps per iPhone
                    android: `geo:0,0?q=${latitude},${longitude}(${label})` // Google Maps per Android
                });

                Linking.openURL(url).catch((err) => {
                    // Piano di emergenza: se l'App Mappe non va, apri il browser
                    console.log("Errore mappa nativa, apro browser:", err);
                    Linking.openURL(webUrl);
                });
            }
        } else {
            Alert.alert("No GPS", "Posizione non registrata.");
        }
    };

    // --- FILTRI INTELLIGENTI ---
    const isPendingStatus = (s) => ['assegnato', 'pending'].includes((s||'').toLowerCase());
    const isActiveStatus = (s) => ['accettato', 'in-corso', 'confirmed'].includes((s||'').toLowerCase());
// Aggiungi 'scaduto' alla lista
const isHistoryStatus = (s) => ['completato', 'rifiutato', 'rejected', 'scaduto'].includes((s||'').toLowerCase());

// --- ORDINAMENTO INTELLIGENTE ---
    // Funzione per ordinare dal più VICINO al più LONTANO (Urgenti in alto)
    const sortAscending = (a, b) => new Date(a.date + 'T' + a.startTime) - new Date(b.date + 'T' + b.startTime);
    
    // Funzione per ordinare dal più RECENTE al più VECCHIO (Ultimi chiusi in alto)
    const sortDescending = (a, b) => new Date(b.date + 'T' + b.startTime) - new Date(a.date + 'T' + a.startTime);

    // 1. DA CONFERMARE: Ordine Crescente (Prima quelli che scadono a breve)
    const shiftsPending = allShifts
        .filter(s => isPendingStatus(s.status) && s.collaboratorId !== currentUserId)
        .sort(sortAscending);

    // 2. OPERATIVI: Ordine Crescente (Prima quelli di oggi/domani)
    const shiftsActive = allShifts
        .filter(s => isActiveStatus(s.status) && s.collaboratorId !== currentUserId)
        .sort(sortAscending);
    
    // 3. STORICO: Ordine Decrescente (Prima l'ultimo completato)
    const shiftsHistory = allShifts
        .filter(s => isHistoryStatus(s.status))
        .sort(sortDescending);

const renderShiftItem = ({ item }) => {
        const isMyShift = item.collaboratorId === currentUserId; 
        const statusLower = (item.status || '').toLowerCase();
        const isFounder = currentUserRole === 'FOUNDER';

        // --- CALCOLO COLORI E TESTI ---
        let badgeColor = Colors.accent; // Default Blu (Accettato)
        let badgeText = (item.status || '').toUpperCase();
        let isLateStart = false; // Nuova variabile per tracciare il ritardo

        // 1. Logica Standard
        if (statusLower === 'completato') { badgeColor = Colors.success; badgeText = "SALVATO"; }
        else if (statusLower === 'rifiutato') { badgeColor = Colors.error; badgeText = "RIFIUTATO"; }
        else if (statusLower === 'scaduto') { badgeColor = '#64748b'; badgeText = "NON CONFERMATO"; }
        
        // 2. Logica Speciale: ACCETTATO ma NON PARTITO (Il tuo "Grigio Attenzione")
        else if (statusLower === 'accettato') {
            // Calcoliamo l'ora di inizio prevista
            const startDate = getShiftDateTime(item.date, item.startTime);
            
            // Se l'ora attuale ha superato l'inizio (e non è ancora in-corso)
            // Aggiungiamo 5 minuti di tolleranza prima di farlo diventare grigio
            const warningThreshold = new Date(startDate.getTime() + 5 * 60000);

            if (currentTime > warningThreshold) {
                badgeColor = '#6b7280'; // Grigio scuro
                badgeText = "NON AVVIATO ⚠️"; // Testo con icona attenzione
                isLateStart = true;
            } else {
                // Se è in orario
                badgeColor = Colors.accent;
                badgeText = "CONFERMATO";
            }
        }
        else if (statusLower === 'in-corso') { badgeColor = Colors.success; }

        // --- 1. VERSIONE STORICO (Opaca) ---
        if (currentTab === 'HISTORY') {
            return (
                <View style={[styles.card, { opacity: 0.6, borderColor: Colors.border }]}>
                    <View style={{marginBottom: 8}}>
                        <Text style={[styles.locationText, { color: Colors.textSecondary }]}>{item.location}</Text>
                    </View>
                    <Text style={{ color: Colors.textSecondary, marginBottom: 8, fontSize: 12 }}>
                        📅 {item.date} • {item.startTime}-{item.endTime}
                    </Text>
                    <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                        <Text style={{ color: Colors.textSecondary, fontSize: 13, flex: 1 }}>
                            👤 {item.collaboratorName}
                        </Text>
                        <View style={[styles.badge, { backgroundColor: badgeColor }]}>
                            <Text style={[styles.badgeText, { color: '#FFF' }]}>{badgeText}</Text>
                        </View>
                    </View>
                </View>
            );
        }

        // --- 2. VERSIONE OPERATIVA / PENDING ---
        return (
            <TouchableOpacity style={[
                styles.card, 
                statusLower === 'in-corso' && {borderColor: Colors.success, borderWidth:2},
                // Se è in ritardo grave, mettiamo un bordino grigio per evidenziare il problema
                isLateStart && {borderColor: '#6b7280', borderWidth: 1, borderStyle: 'dashed'}
            ]}
                onPress={() => navigation.navigate('ModificaTurno', { shift: item })}
>
                
{/* RIGA 1: TITOLO */}
<View style={{marginBottom: 5, flexDirection:'row', justifyContent:'space-between'}}>
    <Text style={styles.locationText}>{item.location}</Text>
    <Feather name="edit-2" size={14} color={Colors.textSecondary} />
</View>

                {/* RIGA 2: ORARIO */}
                <Text style={styles.timeText}>📅 {item.date} • ⏰ {item.startTime} - {item.endTime}</Text>
                
                {/* RIGA 3: NOME + BADGE DINAMICO */}
                <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop: 5}}>
                    <Text style={[styles.roleText, {flex: 1}]}>
                        👤 {item.collaboratorName} {isMyShift ? "(TU)" : ""}
                    </Text>

                    <View style={[styles.badge, { backgroundColor: badgeColor }]}>
                        <Text style={[styles.badgeText, {color: '#FFF'}]}>{badgeText}</Text>
                    </View>
                </View>

                {/* AREA AZIONI */}
                <View style={styles.actionContainer}>
                    {/* Se è IN CORSO -> Tasto Emergenza */}
                    {!isMyShift && (isFounder || currentUserRole === 'AMMINISTRATORE') && statusLower === 'in-corso' && (
                        <TouchableOpacity 
                            style={[styles.actionBtn, {backgroundColor: '#7f1d1d', marginTop: 15, borderWidth: 1, borderColor: '#ef4444'}]} 
                            onPress={() => handleEndShift(item, true)}
                        >
                            <Feather name="alert-triangle" size={18} color="#fca5a5" />
                            <Text style={[styles.actionBtnText, {color: '#fca5a5'}]}>ARRESTO EMERGENZA</Text>
                        </TouchableOpacity>
                    )}

                    {/* Se è NON AVVIATO (Ritardo) -> Magari vuoi chiamarlo? (Opzionale) */}
                    {isLateStart && (
                        <Text style={{color: '#fca5a5', fontSize: 10, marginTop: 10, textAlign:'center', fontStyle:'italic'}}>
                            TURNO ACCETTATO, MANCATO INIZIO, POSIZIONE GPS NON SEGNATA.
                        </Text>
                    )}
                </View>

                {statusLower === 'in-corso' && (
                    <TouchableOpacity style={{marginTop:15, flexDirection:'row', alignItems:'center', justifyContent:'center'}} onPress={() => handleOpenMap(item)}>
                        <Feather name="map" size={14} color={Colors.accent} />
                        <Text style={{color:Colors.accent, fontSize:12, marginLeft:5, fontWeight:'bold'}}>VEDI POSIZIONE LIVE</Text>
                    </TouchableOpacity>
                )}
            </TouchableOpacity>
        );
    };

    let dataToShow = currentTab === 'PENDING' ? shiftsPending : (currentTab === 'PROGRAM' ? shiftsActive : shiftsHistory);

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
            <View style={styles.headerContainer}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Feather name="arrow-left" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.screenTitle}>GESTIONE TURNI</Text>
                {loadingAction && <ActivityIndicator size="small" color={Colors.accent} style={{marginLeft:10}}/>}
            </View>
            <View style={styles.tabContainer}>
                <TouchableOpacity style={[styles.tabButton, currentTab === 'PENDING' && styles.tabActive]} onPress={() => setCurrentTab('PENDING')}><Text style={[styles.tabText, currentTab === 'PENDING' && styles.tabTextActive]}>DA CONFERMARE</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.tabButton, currentTab === 'PROGRAM' && styles.tabActive]} onPress={() => setCurrentTab('PROGRAM')}><Text style={[styles.tabText, currentTab === 'PROGRAM' && styles.tabTextActive]}>OPERATIVI</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.tabButton, currentTab === 'HISTORY' && styles.tabActive]} onPress={() => setCurrentTab('HISTORY')}><Text style={[styles.tabText, currentTab === 'HISTORY' && styles.tabTextActive]}>STORICO</Text></TouchableOpacity>
            </View>
            <FlatList
                data={dataToShow}
                keyExtractor={item => item.id}
                renderItem={renderShiftItem}
                contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
                ListEmptyComponent={<View style={{marginTop: 50, alignItems:'center'}}><Feather name="inbox" size={40} color={Colors.textSecondary} /><Text style={styles.emptyText}>Nessun turno in questa lista.</Text></View>}
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
    actionContainer: { marginTop: 15, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 8, flex: 1 },
    actionBtnText: { color: '#FFF', fontWeight: 'bold', marginLeft: 8, fontSize: 12 }
});
