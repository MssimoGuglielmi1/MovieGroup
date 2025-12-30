//AdminStaffScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, FlatList, StatusBar, Platform, Alert, Modal, Linking, ActivityIndicator, TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { db, auth } from './firebaseConfig';
import { collection, query, where, onSnapshot, doc, deleteDoc, getDoc, updateDoc } from 'firebase/firestore';

//Collegamenti
import WelcomeModal from './WelcomeModal';

const Colors = {
    background: '#000000', surface: '#1C1C1E', textMain: '#FFFFFF', textSub: '#8E8E93',
    primary: '#4CAF50', accent: '#0A84FF', border: '#2C2C2E', error: '#FF453A',
    cyan: '#00D1FF', yellow: '#EAB308', purple: '#BF5AF2', info: '#64748B', orange: '#FF9500',
};

export default function AdminStaffScreen({ navigation, route }) {
    const { data: passedData, mode, handleAccept, handleReject } = route.params || {};

    const [staff, setStaff] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewerRole, setViewerRole] = useState(null);
    const [currentUserId, setCurrentUserId] = useState(null);
    const [highlightedIds, setHighlightedIds] = useState([]); 
    const [selectedUser, setSelectedUser] = useState(null); 
    const [modalVisible, setModalVisible] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [showLegend, setShowLegend] = useState(false);

    useEffect(() => {
        const init = async () => {
            const user = auth.currentUser;
            if(user) {
                setCurrentUserId(user.uid);
                const snap = await getDoc(doc(db, "users", user.uid));
                if(snap.exists()) setViewerRole(snap.data().role);
            }
        };
        init();

// ---------------------------------------------------------
        // ASCOLTO LIVE (FIX SINCRONIZZAZIONE RICHIESTE) 🟢
        // ---------------------------------------------------------
        let q;

        if (mode === 'PENDING_ACCESS_ALL') {
            // MODO RICHIESTE: Ascolta tutti i NON approvati
            q = query(collection(db, "users"), where("isApproved", "==", false));
        } 
        else if (mode === 'PENDING_ADMINS') {
             // MODO RICHIESTE ADMIN: Solo chi ha chiesto di essere Admin
             q = query(collection(db, "users"), where("isApproved", "==", false), where("adminRequest", "==", true));
        }
        else {
            // MODO GESTIONE STAFF: Tutti gli approvati (Default)
            q = query(collection(db, "users"), where("isApproved", "==", true));
        }

        // ACCENDIAMO IL RADAR
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(u => u.role !== 'FOUNDER'); // Nascondiamo sempre i Founder per sicurezza

            // Ordine Alfabetico
            list.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
            
            setStaff(list);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [mode, passedData]);

    // --- AZIONI ---

    const toggleMoneyVisibility = async (user) => {
        // Blocco di sicurezza: Solo Admin possono avere il blocco soldi
        if (user.role !== 'AMMINISTRATORE') return; 
        if (viewerRole !== 'FOUNDER') return;

        const currentStatus = user.hideMoney || false;
        const newStatus = !currentStatus;

        try {
            await updateDoc(doc(db, "users", user.id), { hideMoney: newStatus });
            const statusText = newStatus ? "OSCURATI (Giallo)" : "VISIBILI (Verde)";
            Alert.alert("Permessi Aggiornati", `Ora i soldi per ${user.firstName} sono: ${statusText}`);
        } catch (e) {
            Alert.alert("Errore", e.message);
        }
    };

// --- FIX BILINGUE: ACCETTA UTENTE ---
// --- FIX BILINGUE: ACCETTA UTENTE (Con aggiornamento lista locale) ---
    const handleAcceptAction = (user) => {
        const doAccept = async () => {
            try {
                // 1. Eseguiamo l'azione sul Database (passata da Home)
                if (handleAccept) {
                    await handleAccept(user.id);
                }
                
                // 2. Aggiorniamo la lista LOCALE (così l'utente sparisce subito dalla vista)
                setStaff(prevStaff => prevStaff.filter(u => u.id !== user.id));

                // 3. Feedback leggero (opzionale)
                if (Platform.OS === 'web') alert("Utente approvato!");
                
            } catch (error) {
                console.error("Errore approvazione:", error);
            }
        };

        if (Platform.OS === 'web') {
            if (confirm(`Accetta: Vuoi approvare l'accesso a ${user.firstName}?`)) {
                doAccept();
            }
        } else {
            Alert.alert("Accetta Utente", `Vuoi approvare l'accesso a ${user.firstName}?`, [
                { text: "Annulla", style: "cancel" },
                { text: "Sì, Approva", onPress: doAccept }
            ]);
        }
    };

    // --- FIX BILINGUE: RIMUOVI / RIFIUTA (Con aggiornamento lista locale) ---
    const handleRemoveAction = (user) => {
        // CASO 1: STIAMO RIFIUTANDO UNA RICHIESTA (Siamo in modalità Pending)
        if (handleReject) {
            const doReject = async () => { 
                try {
                    // 1. Cancelliamo dal Database
                    await handleReject(user.id); 
                    
                    // 2. Rimuoviamo dalla lista LOCALE
                    setStaff(prevStaff => prevStaff.filter(u => u.id !== user.id));

                    // 3. Feedback Web
                    if (Platform.OS === 'web') alert("Richiesta rifiutata e cancellata.");

                } catch (error) {
                    console.error("Errore rifiuto:", error);
                    alert("Errore durante l'eliminazione.");
                }
            };

            if (Platform.OS === 'web') {
                if (confirm(`Rifiuta: Cancellare definitivamente la richiesta di ${user.firstName}?`)) doReject();
            } else {
                Alert.alert("Rifiuta", `Cancellare definitivamente la richiesta di ${user.firstName}?`, [
                    { text: "Annulla", style: "cancel" },
                    { text: "Rifiuta e Cancella", style: "destructive", onPress: doReject }
                ]);
            }
        } 
        
        // CASO 2: STIAMO LICENZIANDO UNO STAFF ESISTENTE (Siamo in modalità Gestione Staff)
        else {
            if (user.id === currentUserId) {
                const msg = "Non puoi licenziare te stesso.";
                if (Platform.OS === 'web') alert(msg); else Alert.alert("Errore", msg);
                return;
            }

            const doRemove = async () => {
                try { 
                    await deleteDoc(doc(db, "users", user.id)); 
                    // Anche qui aggiorniamo la lista locale
                    setStaff(prevStaff => prevStaff.filter(u => u.id !== user.id));
                } 
                catch(e) { 
                    if (Platform.OS === 'web') alert("Errore: " + e.message);
                    else Alert.alert("Errore", e.message); 
                }
            };

            if (Platform.OS === 'web') {
                if (confirm(`Licenziamento: Rimuovere ${user.firstName}?`)) doRemove();
            } else {
                Alert.alert("Licenziamento", `Rimuovere ${user.firstName}?`, [
                    { text: "Annulla", style: "cancel" },
                    { text: "Rimuovi", style: "destructive", onPress: doRemove }
                ]);
            }
        }
    };
        const handleApproveAction = (user) => {
        if (!handleAccept) return;
        const requestedRole = user.role || 'COLLABORATORE';
        Alert.alert("Conferma", `Approvare come ${requestedRole}?`, [
            { text: "Annulla", style: "cancel" },
            { text: "SÌ, APPROVA", onPress: () => { handleAccept(user.id, requestedRole); navigation.goBack(); }}
        ]);
    };

// --- NUOVA LOGICA SWITCH (BILINGUE WEB/APP) ---
        const handleSwitchRole = (user) => {
        if (user.id === currentUserId) return;
        const newRole = user.role === 'AMMINISTRATORE' ? 'COLLABORATORE' : 'AMMINISTRATORE';
        
        const executeSwitch = async () => {
            try { 
                // Prepariamo gli aggiornamenti
                const updates = { role: newRole };
                
                // SE STIAMO RETROCEDENDO A COLLABORATORE:
                // Resettiamo hideMoney a false
                if (newRole === 'COLLABORATORE') {
                    updates.hideMoney = false;
                }

                await updateDoc(doc(db, "users", user.id), updates); 
            } catch(e) { 
                if (Platform.OS === 'web') alert("Errore: " + e.message);
                else Alert.alert("Errore", e.message); 
            } 
        };

        if (Platform.OS === 'web') {
            // WEB (PC)
            if (confirm(`Cambio Ruolo: Impostare ${user.firstName} come ${newRole}?`)) {
                executeSwitch();
            }
        } else {
            // APP (Telefono)
            Alert.alert("Cambio Ruolo", `Impostare ${user.firstName} come ${newRole}?`, [
                { text: "Annulla", style: "cancel" },
                { text: "CONFERMA", onPress: executeSwitch }
            ]);
        }
    };

        const openDetails = (user) => { setSelectedUser(user); setModalVisible(true); };
        const copyToClipboard = (label, text) => { if(text) Alert.alert("Copiato", `${label}: ${text}`); };
        const makeCall = (phoneNumber) => {
        if (!phoneNumber) return Alert.alert("No Numero", "L'utente non ha inserito il cellulare.");
        Linking.openURL(`tel:${phoneNumber.replace(/\s/g, '')}`);
    };
        const handleInfoAction = () => { setShowLegend(true); };

        const renderItem = ({ item }) => {
        const isUserAdmin = item.role === 'AMMINISTRATORE';
        const badgeColor = isUserAdmin ? Colors.cyan : Colors.primary;
        const isRequestMode = mode === 'PENDING_ACCESS_ALL' || mode === 'PENDING_ADMINS';
        
        // Verifica oscuramento
        const isRestricted = item.hideMoney === true && isUserAdmin; 
        const isSuspended = item.isSuspended === true; 

        // 🔥 EFFETTO VISIVO: ARANCIONE SE SOSPESO 🔥
        const cardStyle = isSuspended 
            ? { 
                backgroundColor: 'rgba(255, 149, 0, 0.15)', // Sfondo Arancione trasparente
                borderColor: Colors.orange, 
                borderWidth: 2 
              } 
            : { 
                backgroundColor: Colors.surface, // Sfondo normale
                borderColor: isRestricted ? Colors.yellow : Colors.border,
                borderWidth: 1
              };

        // --- 🔥 FIX INTELLIGENTE 🔥 ---
        // Accetta sia il VERO (boolean) che il TESTO "true" (stringa)
        const isVerified = item.emailVerified === true || item.emailVerified === "true";
        const canManage = viewerRole === 'FOUNDER' || item.role !== 'AMMINISTRATORE';

// --- FUNZIONE CONGELAMENTO (SOSPENSIONE) ---
        const toggleSuspension = async (user) => {
        // 1. Non puoi congelare te stesso
        if (user.id === currentUserId) return; 

        // 2. Capiamo lo stato attuale
        const isCurrentlySuspended = user.isSuspended === true;
        const newStatus = !isCurrentlySuspended;
        const action = isCurrentlySuspended ? "RIATTIVARE" : "SOSPENDERE";

        // 3. Funzione che esegue la modifica su Firebase
        const executeFreeze = async () => {
            try {
                // Scrive nel database il campo 'isSuspended'
                await updateDoc(doc(db, "users", user.id), { isSuspended: newStatus });
                
                if (Platform.OS === 'web') alert(`Fatto: Utente ${newStatus ? 'Sospeso' : 'Riattivato'}.`);
            } catch (e) {
                Alert.alert("Errore", e.message);
            }
        };

        // 4. Chiediamo conferma (Diversa per Web e App)
        if (Platform.OS === 'web') {
            if (confirm(`Conferma: Vuoi ${action} l'account di ${user.firstName}?`)) executeFreeze();
        } else {
            Alert.alert(
                isCurrentlySuspended ? "Scongela Utente" : "Congela Utente ❄️",
                `Vuoi ${action} l'accesso di ${user.firstName}?`,
                [
                    { text: "Annulla", style: "cancel" },
                    { 
                        text: isCurrentlySuspended ? "RIATTIVA" : "SOSPENDI", 
                        style: isCurrentlySuspended ? "default" : "destructive", 
                        onPress: executeFreeze 
                    }
                ]
            );
        }
    };

        return (
<TouchableOpacity 
                activeOpacity={0.9}
                onLongPress={() => toggleMoneyVisibility(item)} 
                delayLongPress={800}
                style={[styles.card, cardStyle]} // <--- ECCO LA MODIFICA
                onPress={() => openDetails(item)}
            >
                <View style={styles.userInfo}>
                    {/* AVATAR */}
                    <View style={[styles.avatar, { borderColor: badgeColor, borderWidth: 1 }]}>
                        <Text style={[styles.avatarText, { color: badgeColor }]}>
                            {item.firstName?.charAt(0)}{item.lastName?.charAt(0)}
                        </Text>
                    </View>

                    <View style={styles.textContainer}>
                        
                        {/* --- RIGA NOME (ZONA COMUNE) --- */}
                        <View style={{flexDirection:'row', alignItems:'center', flexWrap:'wrap'}}>
                            <Text style={styles.nameText}>{item.firstName} {item.lastName}</Text>
                            
                            {/* 🔥 MOSTRA SPUNTA SE isVerified È VERO 🔥 */}
                            {isVerified && (
                                <View style={{marginLeft: 6, backgroundColor: 'rgba(52, 199, 89, 0.2)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1}}>
                                    <Text style={{fontSize: 10, color: Colors.primary, fontWeight:'bold'}}>✅</Text>
                                </View>
                            )}
                            
                            {/* Icona Occhio Barrato */}
                            {/* Icona Occhio Barrato - MODIFICA ENZO: VISIBILE SOLO AL FOUNDER */}
                            {isRestricted && viewerRole === 'FOUNDER' && (
                                <Feather name="eye-off" size={14} color={Colors.yellow} style={{marginLeft: 8}} />
                            )}
                        </View>

                        {/* --- RIGA SOTTO (CONDIZIONALE) --- */}
                        {isRequestMode ? (
                            // SE È UNA RICHIESTA
                            <View style={{marginTop: 4}}>
                                <Text style={{
                                    color: item.role === 'AMMINISTRATORE' ? Colors.cyan : Colors.primary,
                                    fontWeight: '900', fontSize: 14, marginTop: 2, letterSpacing: 0.5
                                }}>
                                    {item.role} 
                                </Text>
                                <Text style={{color: '#8E8E93', fontSize: 10, marginTop: 2, fontStyle: 'italic'}}>
                                    📅 Registrato: {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('it-IT') : "Oggi"}
                                </Text>
                            </View>
                        ) : (
                            // SE È STAFF ATTIVO
                            <Text style={[styles.roleLabel, {color: badgeColor}]}>{item.role}</Text>
                        )}

                        {/* EMAIL */}
                        <Text style={[styles.emailText, {marginTop: 4}]}>📧 {item.email}</Text>
                    </View>
                </View>

                {/* --- AZIONI --- */}
                {isRequestMode ? (
                    <View style={styles.rowActions}>
                        <TouchableOpacity onPress={() => handleAcceptAction(item)} style={[styles.iconBtn, {backgroundColor: Colors.primary+'20'}]}>
                            <Feather name="check" size={20} color={Colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleRemoveAction(item)} style={[styles.iconBtn, {backgroundColor: Colors.error+'20'}]}>
                            <Feather name="x" size={20} color={Colors.error} />
                        </TouchableOpacity>
                    </View>
                ) : (
<View style={styles.columnActions}>
                        
                        {/* RIGA 1: GESTIONE SUPERIORE */}
                        <View style={styles.rowActions}>
                            {/* 1. Dettagli (Blu) - ORA ANCHE PER ADMIN (Per Buste Paga) */}
                            {(viewerRole === 'FOUNDER' || viewerRole === 'AMMINISTRATORE') && (
                                <TouchableOpacity onPress={() => openDetails(item)} style={[styles.iconBtn, {backgroundColor: Colors.accent+'20'}]}>
                                    <Feather name="file-text" size={16} color={Colors.accent} />
                                </TouchableOpacity>
                            )}
                            
                            {/* 2. Ruolo (Viola) - RIMANE SOLO FOUNDER */}
                            {viewerRole === 'FOUNDER' && item.id !== currentUserId && (
                                <TouchableOpacity onPress={() => handleSwitchRole(item)} style={[styles.iconBtn, {backgroundColor: Colors.purple+'20'}]}>
                                    <Feather name="refresh-cw" size={14} color={Colors.purple} />
                                </TouchableOpacity>
                            )}

                            {/* 3. CONGELA (Arancione) - SOLO SE POSSO GESTIRE */}
                            {item.id !== currentUserId && canManage && (
                                <TouchableOpacity 
                                    onPress={() => toggleSuspension(item)} 
                                    style={[
                                        styles.iconBtn, 
                                        { 
                                            // Se Sospeso: Arancione Pieno. Se Sbloccato: Arancione Chiaro (Trasparente)
                                            backgroundColor: isSuspended ? Colors.orange : Colors.orange + '20' 
                                        }
                                    ]}
                                >
                                    <Feather 
                                        name={isSuspended ? "lock" : "unlock"} 
                                        size={16} 
                                        // Se Sospeso: Bianco. Se Sbloccato: Arancione
                                        color={isSuspended ? '#FFF' : Colors.orange} 
                                    />
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* RIGA 2: AZIONI COMUNI */}
                        <View style={styles.rowActions}>
                            {/* 4. Telefono (Verde) */}
                            <TouchableOpacity onPress={() => makeCall(item.phoneNumber)} style={[styles.iconBtn, {backgroundColor: Colors.primary+'20'}]}>
                                <Feather name="phone" size={16} color={Colors.primary} />
                            </TouchableOpacity>
                            
                            {/* 5. Info (Grigio) */}
                            <TouchableOpacity onPress={handleInfoAction} style={[styles.iconBtn, {backgroundColor: Colors.info+'20'}]}>
                                <Feather name="info" size={16} color={Colors.info} />
                            </TouchableOpacity>

                            {/* 6. CESTINO (Rosso) */}
                            {item.id !== currentUserId && canManage && (
                                <TouchableOpacity onPress={() => handleRemoveAction(item)} style={[styles.iconBtn, {backgroundColor: Colors.error+'20'}]}>
                                    <Feather name="trash-2" size={16} color={Colors.error} />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    const isFounder = viewerRole === 'FOUNDER';
    // --- LOGICA FILTRO RICERCA ---
    const filteredStaff = staff.filter(user => {
        if (!searchText) return true; // Se è vuoto, mostra tutti
        const searchLower = searchText.toLowerCase();
        const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
        return fullName.includes(searchLower); // Cerca nel nome e cognome
    });
    const pageTitle = mode === 'PENDING_ACCESS_ALL' ? `RICHIESTE (${staff.length})` : `GESTIONE STAFF (${staff.length})`;

return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}><Feather name="arrow-left" size={24} color={Colors.textMain} /></TouchableOpacity>
                <Text style={styles.title}>{pageTitle}</Text>
                <View style={{width:24}}/>
            </View>

            {/* --- NUOVA BARRA DI RICERCA --- */}
            <View style={styles.searchContainer}>
                <Feather name="search" size={20} color={Colors.textSub} style={{marginRight: 10}} />
                <TextInput 
                    style={styles.searchInput}
                    placeholder="Cerca collaboratore..."
                    placeholderTextColor={Colors.textSub}
                    value={searchText}
                    onChangeText={setSearchText}
                />
                {searchText.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchText('')}>
                        <Feather name="x" size={20} color={Colors.textSub} />
                    </TouchableOpacity>
                )}
            </View>

            {loading ? <ActivityIndicator style={{marginTop:50}} color={Colors.primary} /> :
            <FlatList
                data={filteredStaff} // <--- CAMBIA 'staff' CON 'filteredStaff'
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={{ padding: 20, paddingTop: 5 }} // Un po' meno padding sopra
                ListEmptyComponent={<Text style={styles.emptyText}>Nessun risultato.</Text>}
            />}
            
            {/* ... qui sotto c'è il resto (Modals, etc.) ... */}
            
             <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>SCHEDA PERSONALE</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}><Feather name="x" size={24} color={Colors.textMain}/></TouchableOpacity>
                        </View>
                        {selectedUser && (
                            <View>
                                <View style={styles.detailRow}><Text style={styles.detailLabel}>Nome:</Text><Text style={styles.detailValue}>{selectedUser.firstName} {selectedUser.lastName}</Text></View>
                                <View style={styles.detailRow}><Text style={styles.detailLabel}>Ruolo:</Text><Text style={[styles.detailValue, {color: selectedUser.role === 'AMMINISTRATORE' ? Colors.cyan : Colors.primary}]}>{selectedUser.role}</Text></View>
{/* CELLULARE (Solo Visualizzazione - La chiamata si fa dal tasto Verde fuori) */}
<View style={styles.sensitiveBox}>
    <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
        <Text style={styles.boxLabel}>CELLULARE</Text>
        <Feather name="phone" size={14} color={Colors.textSub}/> 
    </View>
    {/* Colore normale (Bianco) perché non è più un link cliccabile */}
    <Text style={[styles.boxValue, {color: Colors.textMain}]}>
        {selectedUser.phoneNumber || "Non inserito"}
    </Text>
</View>
                                {/* MOSTRA DATI FISCALI A FOUNDER E ADMIN */}
                                {(viewerRole === 'FOUNDER' || viewerRole === 'AMMINISTRATORE') && (
                                    <>
                                        <Text style={[styles.sectionHeader, {marginTop: 15, color: Colors.cyan}]}>DATI FISCALI</Text>
                                        <TouchableOpacity onPress={() => copyToClipboard("CF", selectedUser.codiceFiscale)} style={[styles.sensitiveBox, {borderColor: Colors.cyan}]}><Text style={styles.boxLabel}>CODICE FISCALE</Text><Text style={styles.boxValue}>{selectedUser.codiceFiscale || "-"}</Text></TouchableOpacity>
                                        <TouchableOpacity onPress={() => copyToClipboard("IBAN", selectedUser.iban)} style={[styles.sensitiveBox, {borderColor: Colors.cyan}]}><Text style={styles.boxLabel}>IBAN</Text><Text style={[styles.boxValue, {color: Colors.cyan}]}>{selectedUser.iban || "-"}</Text></TouchableOpacity>
                                    </>
                                )}
                            </View>
                        )}
                    </View>
                </View>
            </Modal>
{/* USIAMO IL WELCOME MODAL CON LOGICA DINAMICA */}
            <WelcomeModal 
                visible={showLegend} 
                onClose={() => setShowLegend(false)} 
                // Se sono FOUNDER passo "LEGEND_FOUNDER", altrimenti "LEGEND_ADMIN"
                userRole={viewerRole === 'FOUNDER' ? "LEGEND_FOUNDER" : "LEGEND_ADMIN"} 
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: Colors.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
    title: { fontSize: 18, fontWeight: '900', color: Colors.textMain, letterSpacing: 1 },
    emptyText: { color: Colors.textSub, textAlign: 'center', marginTop: 50 },
    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
    userInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
    textContainer: { flex: 1, justifyContent: 'center' },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    avatarText: { fontWeight: 'bold' },
    nameText: { color: Colors.textMain, fontWeight: 'bold', fontSize: 15 },
    roleLabel: { fontSize: 10, fontWeight:'bold', marginTop:2 },
    emailText: { color: Colors.textSub, fontSize: 11, marginTop: 2 },
    columnActions: { flexDirection: 'column', gap: 6, alignItems: 'flex-end', justifyContent: 'center' },
    rowActions: { flexDirection: 'row', gap: 6 },
    iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 25, maxHeight: '85%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 18, fontWeight: '900', color: Colors.textMain },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    detailLabel: { color: Colors.textSub },
    detailValue: { color: Colors.textMain, fontWeight: 'bold' },
    sectionHeader: { color: Colors.accent, fontSize: 12, fontWeight: 'bold', marginBottom: 10 },
    sensitiveBox: { backgroundColor: '#000', padding: 15, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
    boxLabel: { color: Colors.textSub, fontSize: 10, marginBottom: 4 },
    boxValue: { color: Colors.textMain, fontSize: 16, fontWeight: 'bold' },
    searchContainer: {flexDirection: 'row',alignItems: 'center',backgroundColor: '#2C2C2E',marginHorizontal: 20,marginBottom: 10,paddingHorizontal: 15,borderRadius: 10,
    height: 45,},
    searchInput: {flex: 1,color: '#FFFFFF',fontSize: 16,},
});