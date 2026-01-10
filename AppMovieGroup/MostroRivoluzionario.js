//MostroRivoluzionario.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, Alert, Platform, KeyboardAvoidingView, Switch, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { db, auth } from './firebaseConfig';
import { collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, query, orderBy, getDoc, getDocs } from 'firebase/firestore';
import { sendPushNotification } from './Notifiche';

// --- COMPONENTE CARD (PROFESSIONAL VERSION) ---
const ShiftCard = ({ item, userRole, currentUser, onDelete, onVote, onEdit, onAssign }) => {
    const [myNote, setMyNote] = useState('');
    
    // Recuperiamo il voto esistente
    const myVoteData = item.availabilities?.[currentUser?.uid];
    const myStatus = myVoteData?.status;

    useEffect(() => {
        if (myVoteData?.note) setMyNote(myVoteData.note);
    }, []);

    // Trasformiamo la mappa in array per poterci ciclare sopra [UID, DATA]
    const yesListEntries = item.availabilities 
        ? Object.entries(item.availabilities).filter(([_, v]) => v.status === 'YES')
        : [];

    return (
        <View style={styles.card}>
            {/* HEADER CARD */}
            <View style={styles.cardHeader}>
                <View style={{flex:1}}>
                    <Text style={styles.dateText}>📅 {item.dateText}</Text>
                    <View style={{flexDirection:'row', alignItems:'center', marginTop:4, marginBottom:4}}>
                        <Feather name="clock" size={14} color="#22d3ee" style={{marginRight:5}} />
                        <Text style={styles.timeText}>
                            {item.startTimeText} {item.endTimeText ? `- ${item.endTimeText}` : ''}
                        </Text>
                    </View>
                    <Text style={styles.locationText}>📍 {item.locationText}</Text>
                    
                    {/* VISUALIZZAZIONE PAUSA */}
                    {item.hasBreak && (
                        <Text style={{color: '#f97316', fontSize: 12, fontWeight: 'bold', marginTop: 2}}>
                            ☕ Pausa: {item.breakStartTime} - {item.breakEndTime}
                        </Text>
                    )}

                    {item.note ? <Text style={styles.noteText}>📝 {item.note}</Text> : null}
                </View>

                {/* EDIT/DELETE (SOLO FOUNDER/ADMIN) */}
                {(userRole === 'FOUNDER' || userRole === 'AMMINISTRATORE') && (
                    <View style={{flexDirection:'row', alignItems:'center'}}>
                        <TouchableOpacity onPress={() => onEdit(item)} style={{marginLeft:10, padding:5}}>
                            <Feather name="edit-3" size={20} color="#fbbf24" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => onDelete(item.id)} style={{marginLeft:5, padding:5}}>
                            <Feather name="trash-2" size={20} color="#ef4444" />
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* SEZIONE VOTO (Solo se NON sei Founder - Lui non vota, decide) */}
            {userRole !== 'FOUNDER' && (
                <View style={styles.voteContainer}>
                    <Text style={styles.question}>La tua disponibilità:</Text>
                    <TextInput 
                        style={styles.noteInput}
                        placeholder="Aggiungi nota (es. Posso dalle 17:00)..."
                        placeholderTextColor="#64748b"
                        value={myNote}
                        onChangeText={setMyNote}
                        multiline
                    />
                    <View style={styles.buttonsRow}>
                        <TouchableOpacity 
                            style={[styles.voteBtn, myStatus === 'YES' ? styles.btnYesSelected : styles.btnOutline]}
                            onPress={() => onVote(item.id, 'YES', myNote)}
                        >
                            <Text style={[styles.btnText, myStatus === 'YES' && {color:'#fff'}]}>👍 CI SONO</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={[styles.voteBtn, myStatus === 'NO' ? styles.btnNoSelected : styles.btnOutline]}
                            onPress={() => onVote(item.id, 'NO', myNote)}
                        >
                            <Text style={[styles.btnText, myStatus === 'NO' && {color:'#fff'}]}>👎 PASSO</Text>
                        </TouchableOpacity>
                    </View>
                    {myStatus && (
                        <View style={styles.feedbackContainer}>
                            <Feather name="check-circle" size={16} color="#4CAF50" style={{marginRight:6}} />
                            <Text style={styles.feedbackText}>
                                REGISTRATO: <Text style={{color:'#FFF'}}>{myStatus === 'YES' ? 'PRESENTE' : 'ASSENTE'}</Text>
                            </Text>
                        </View>
                    )}
                </View>
            )}

            {/* LISTA PRESENTI & ASSEGNAZIONE RAPIDA (PROFESSIONAL) */}
            {(userRole === 'FOUNDER' || userRole === 'AMMINISTRATORE') && (
                <View style={styles.adminView}>
                    <Text style={styles.adminTitle}>DISPONIBILITÀ ({yesListEntries.length}):</Text>
                    {yesListEntries.length > 0 ? (
                        <View>
                            {yesListEntries.map(([uid, data], index) => {
                                // SICUREZZA ADMIN: L'Admin non può assegnarsi turni da solo
                                const isMe = uid === currentUser.uid;
                                const showAssignButton = userRole === 'FOUNDER' || (userRole === 'AMMINISTRATORE' && !isMe);

                                return (
                                    <View key={index} style={styles.rowCandidate}>
                                        <View style={{flex:1}}>
                                            <Text style={{color:'#FFF', fontSize:13}}>
                                                • <Text style={{fontWeight:'bold'}}>{data.name}</Text>
                                                {data.note ? <Text style={{color:'#94a3b8', fontStyle:'italic'}}> ({data.note})</Text> : ''}
                                            </Text>
                                        </View>
                                        
                                        {/* TASTO ASSEGNA (Updated Look) */}
                                        {showAssignButton && (
                                            <TouchableOpacity 
                                                style={styles.assignBtn} 
                                                onPress={() => onAssign(item, uid, data.name)}
                                            >
                                                <Text style={styles.assignBtnText}>ASSEGNA</Text>
                                                <Feather name="check" size={14} color="#000" />
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    ) : (
                        <Text style={{color:'#64748b', fontStyle:'italic', fontSize:12}}>Nessuna disponibilità.</Text>
                    )}
                </View>
            )}
        </View>
    );
};

// --- COMPONENTE PRINCIPALE ---
export default function MostroRivoluzionario({ navigation }) {
    const [shifts, setShifts] = useState([]);
    
    // --- STATI FISARMONICA & CREAZIONE ---
    const [isCreatorOpen, setIsCreatorOpen] = useState(false); // Default CHIUSO
    
    // Campi Creazione
    const [newDate, setNewDate] = useState('');
    const [newStartTime, setNewStartTime] = useState('');
    const [newEndTime, setNewEndTime] = useState('');
    const [newLocation, setNewLocation] = useState('');
    const [newNote, setNewNote] = useState('');
    
    // Campi Pausa
    const [hasBreak, setHasBreak] = useState(false);
    const [breakStartTime, setBreakStartTime] = useState('');
    const [breakEndTime, setBreakEndTime] = useState('');

    const [editingId, setEditingId] = useState(null); 
    const [loading, setLoading] = useState(false);
    
    const currentUser = auth.currentUser;
    const [userRole, setUserRole] = useState(null);

    useEffect(() => {
        const getUserRole = async () => {
            if (currentUser) {
                const userSnap = await getDoc(doc(db, "users", currentUser.uid));
                if (userSnap.exists()) setUserRole(userSnap.data().role);
            }
        };
        getUserRole();
    }, [currentUser]);

    useEffect(() => {
        const q = query(collection(db, "provisional_shifts"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setShifts(list);
        });
        return unsubscribe;
    }, []);

    // --- FUNZIONE PER NOTIFICARE TUTTI ---
    const notifyAllUsers = async (title, body) => {
        try {
            const usersRef = collection(db, "users");
            const snapshot = await getDocs(usersRef);
            snapshot.docs.forEach(doc => {
                const userData = doc.data();
                if (userData.expoPushToken && doc.id !== auth.currentUser.uid) {
                    sendPushNotification(userData.expoPushToken, title, body);
                }
            });
        } catch (error) { console.log("Notifica errore:", error); }
    };

    // --- 1. SALVATAGGIO PROPOSTA (CREA/MODIFICA) ---
    const handleSavePost = async () => {
        if (!newDate.trim() || !newLocation.trim() || !newStartTime.trim()) { 
            Alert.alert("Mancano dati", "Inserisci almeno Data, Orari e Luogo!"); 
            return; 
        }

        setLoading(true);
        try {
            const postData = {
                dateText: newDate,
                startTimeText: newStartTime,
                endTimeText: newEndTime,
                locationText: newLocation,
                note: newNote,
                // Salvataggio Pausa
                hasBreak: hasBreak,
                breakStartTime: hasBreak ? breakStartTime : '',
                breakEndTime: hasBreak ? breakEndTime : '',
            };

            if (editingId) {
                await updateDoc(doc(db, "provisional_shifts", editingId), postData);
                const msg = "Post aggiornato.";
                Platform.OS === 'web' ? alert(msg) : Alert.alert("Fatto", msg);
            } else {
                await addDoc(collection(db, "provisional_shifts"), {
                    ...postData,
                    createdAt: new Date(),
                    availabilities: {} 
                });
                await notifyAllUsers("Nuovo Avviso in Bacheca", `Nuova previsione per il ${newDate} a ${newLocation}. Controlla ora.`);
                const msg = "Pubblicato.";
                Platform.OS === 'web' ? alert(msg) : Alert.alert("Pubblicato", "La richiesta è online.");
            }
            resetForm(); 
            setIsCreatorOpen(false); // Chiude la tendina dopo aver salvato

        } catch (e) { Alert.alert("Errore", e.message); }
        setLoading(false);
    };

    // --- 2. ASSEGNAZIONE AUTOMATICA (PROFESSIONAL) ---
    const handleInstantAssign = async (shiftPost, targetUserId, targetUserName) => {
        Alert.alert(
            "Conferma Assegnazione",
            `Vuoi creare il turno reale per ${targetUserName}?\nUserà i dati della bacheca e la tariffa standard.`,
            [
                { text: "Annulla", style: "cancel" },
                { text: "CONFERMA E CREA", onPress: async () => {
                    try {
                        setLoading(true);
                        
                        // 1. Recupera Configurazione Banca Centrale (Per la tariffa)
                        const configSnap = await getDoc(doc(db, "settings", "globalConfig"));
                        let defaultRate = "0.10";
                        let defaultType = "minute";
                        if (configSnap.exists()) {
                            defaultRate = configSnap.data().defaultRate || "0.10";
                            defaultType = configSnap.data().defaultType || "minute";
                        }

                        // 2. Crea il documento nella collezione REALE "shifts"
                        await addDoc(collection(db, "shifts"), {
                            date: shiftPost.dateText, 
                            startTime: shiftPost.startTimeText,
                            endTime: shiftPost.endTimeText,
                            location: shiftPost.locationText,
                            collaboratorId: targetUserId,
                            collaboratorName: targetUserName,
                            role: "COLLABORATORE", 
                            status: "assegnato",
                            payoutRate: defaultRate,
                            rateType: defaultType,
                            
                            // Dati Pausa dalla Bacheca
                            hasBreak: shiftPost.hasBreak || false,
                            breakStartTime: shiftPost.breakStartTime || '',
                            breakEndTime: shiftPost.breakEndTime || '',
                            
                            // Audit
                            createdBy: auth.currentUser.uid,
                            creatorName: userRole === 'FOUNDER' ? "FOUNDER" : "ADMIN",
                            createdAt: new Date().toISOString()
                        });

                        // 3. Notifica il collaboratore
                        const targetUserSnap = await getDoc(doc(db, "users", targetUserId));
                        if (targetUserSnap.exists()) {
                            const token = targetUserSnap.data().expoPushToken;
                            if (token) {
                                await sendPushNotification(token, "Turno Confermato", `Il turno del ${shiftPost.dateText} ti è stato assegnato ufficialmente.`);
                            }
                        }

                        Alert.alert("Eseguito", `Turno creato per ${targetUserName}.`);
                    } catch (e) {
                        console.error(e);
                        Alert.alert("Errore", "Impossibile assegnare il turno.");
                    } finally {
                        setLoading(false);
                    }
                }}
            ]
        );
    };

    const startEdit = (item) => {
        setNewDate(item.dateText);
        setNewStartTime(item.startTimeText);
        setNewEndTime(item.endTimeText);
        setNewLocation(item.locationText);
        setNewNote(item.note);
        setHasBreak(item.hasBreak || false);
        setBreakStartTime(item.breakStartTime || '');
        setBreakEndTime(item.breakEndTime || '');
        
        setEditingId(item.id);
        setIsCreatorOpen(true); // Apre la tendina per modificare
    };

    const resetForm = () => {
        setNewDate(''); setNewStartTime(''); setNewEndTime(''); setNewLocation(''); setNewNote('');
        setHasBreak(false); setBreakStartTime(''); setBreakEndTime('');
        setEditingId(null);
    };

    const handleVote = async (shiftId, status, noteText) => {
        const shiftRef = doc(db, "provisional_shifts", shiftId);
        const userSnap = await getDoc(doc(db, "users", currentUser.uid));
        const fullName = userSnap.exists() ? `${userSnap.data().firstName} ${userSnap.data().lastName}` : "Utente";

        try {
            await updateDoc(shiftRef, {
                [`availabilities.${currentUser.uid}`]: { status: status, name: fullName, note: noteText }
            });
        } catch (e) { Alert.alert("Errore", "Impossibile aggiornare."); }
    };

    const handleDelete = async (id) => {
        const doDelete = async () => await deleteDoc(doc(db, "provisional_shifts", id));
        Platform.OS === 'web' ? (confirm("Eliminare?") && doDelete()) : Alert.alert("Elimina", "Confermi?", [{text:"No"}, {text:"Sì", onPress:doDelete}]);
    };

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Feather name="arrow-left" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Bacheca Previsionale</Text>
            </View>

            {(userRole === 'FOUNDER' || userRole === 'AMMINISTRATORE') && (
                <View style={styles.accordionContainer}>
                    {/* BARRA FISARMONICA */}
                    <TouchableOpacity 
                        style={[styles.accordionHeader, editingId && {borderColor:'#fbbf24'}]} 
                        onPress={() => {
                            if (editingId) {
                                Alert.alert("Modifica in corso", "Salva o annulla prima di chiudere.");
                            } else {
                                setIsCreatorOpen(!isCreatorOpen);
                            }
                        }}
                    >
                        <Text style={[styles.createTitle, editingId && {color:'#fbbf24'}]}>
                            {editingId ? "✏️ MODIFICA IN CORSO..." : "➕ CREA NUOVA PROPOSTA"}
                        </Text>
                        <Feather name={isCreatorOpen ? "chevron-up" : "chevron-down"} size={20} color={editingId ? '#fbbf24' : '#8b5cf6'} />
                    </TouchableOpacity>

                    {/* CONTENUTO A SCOMPARSA */}
                    {isCreatorOpen && (
                        <View style={styles.createBox}>
                            {editingId && (
                                <TouchableOpacity onPress={resetForm} style={{alignSelf:'flex-end', marginBottom:10}}>
                                    <Text style={{color:'#ef4444', fontSize:11, fontWeight:'bold'}}>ANNULLA MODIFICA X</Text>
                                </TouchableOpacity>
                            )}

                            <TextInput style={[styles.input, {marginBottom:10}]} placeholder="Data (es. 2026-08-15)" placeholderTextColor="#94a3b8" value={newDate} onChangeText={setNewDate}/>
                            <View style={{flexDirection:'row', gap:10, marginBottom:10}}>
                                <TextInput style={[styles.input, {flex:1}]} placeholder="Inizio (18:00)" placeholderTextColor="#94a3b8" value={newStartTime} onChangeText={setNewStartTime}/>
                                <TextInput style={[styles.input, {flex:1}]} placeholder="Fine (04:00)" placeholderTextColor="#94a3b8" value={newEndTime} onChangeText={setNewEndTime}/>
                            </View>
                            <TextInput style={[styles.input, {marginBottom:10}]} placeholder="Luogo (es. Stadio San Siro)" placeholderTextColor="#94a3b8" value={newLocation} onChangeText={setNewLocation}/>
                            
                            {/* --- SEZIONE PAUSA AGGIUNTA --- */}
                            <View style={styles.breakContainer}>
                                <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
                                    <Text style={{color:'#fff', fontWeight:'bold'}}>Pausa prevista?</Text>
                                    <Switch value={hasBreak} onValueChange={setHasBreak} trackColor={{false: "#767577", true: "#f97316"}} thumbColor={hasBreak ? "#fff" : "#f4f3f4"} />
                                </View>
                                {hasBreak && (
                                    <View style={{flexDirection:'row', gap:10}}>
                                        <TextInput style={[styles.input, {flex:1, borderColor:'#f97316'}]} placeholder="Inizio Pausa" placeholderTextColor="#94a3b8" value={breakStartTime} onChangeText={setBreakStartTime}/>
                                        <TextInput style={[styles.input, {flex:1, borderColor:'#f97316'}]} placeholder="Fine Pausa" placeholderTextColor="#94a3b8" value={breakEndTime} onChangeText={setBreakEndTime}/>
                                    </View>
                                )}
                            </View>
                            {/* ----------------------------- */}

                            <View style={{flexDirection:'row', gap:10, marginTop:10}}>
                                <TextInput style={[styles.input, {flex:1}]} placeholder="Note extra (es. Abito scuro)" placeholderTextColor="#94a3b8" value={newNote} onChangeText={setNewNote}/>
                                <TouchableOpacity 
                                    style={[styles.pubBtn, editingId && {backgroundColor:'#fbbf24'}]} 
                                    onPress={handleSavePost}
                                    disabled={loading}
                                >
                                    {loading ? <Feather name="loader" size={20} color="#0f172a" /> : <Feather name={editingId ? "save" : "send"} size={20} color="#0f172a" />}
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>
            )}

            <FlatList 
                data={shifts}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                    <ShiftCard 
                        item={item} 
                        userRole={userRole} 
                        currentUser={currentUser} 
                        onDelete={handleDelete} 
                        onVote={handleVote}
                        onEdit={startEdit}
                        onAssign={handleInstantAssign} // Passiamo la funzione 
                    />
                )}
                contentContainerStyle={{paddingBottom: 40}}
            />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a', padding: 20, paddingTop: 50 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    backBtn: { marginRight: 15 },
    headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
    
    // STILI ACCORDION
    accordionContainer: { marginBottom: 25 },
    accordionHeader: { backgroundColor: '#1e293b', padding: 15, borderRadius: 12, flexDirection:'row', justifyContent:'space-between', alignItems:'center', borderWidth: 1, borderColor: '#8b5cf6' },
    createBox: { backgroundColor: '#1e293b', padding: 15, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, marginTop: -5, borderWidth: 1, borderTopWidth:0, borderColor: '#8b5cf6' },
    createTitle: { color: '#8b5cf6', fontWeight: 'bold', textTransform:'uppercase', fontSize:12 },
    
    input: { backgroundColor: '#0f172a', color: '#fff', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#334155' },
    breakContainer: { backgroundColor: 'rgba(249, 115, 22, 0.1)', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(249, 115, 22, 0.3)', marginBottom: 10 },
    
    pubBtn: { backgroundColor: '#8b5cf6', padding: 12, borderRadius: 8, justifyContent:'center', alignItems:'center', width: 50 },
    
    card: { backgroundColor: '#1e293b', padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#334155' },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
    dateText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
    timeText: { color: '#22d3ee', fontSize: 15, fontWeight: 'bold' },
    locationText: { color: '#fbbf24', fontSize: 15, fontWeight:'bold', marginTop:2 }, 
    noteText: { color: '#cbd5e1', marginTop: 8, fontSize:14, fontStyle:'italic' },
    
    voteContainer: { borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 12 },
    question: { color: '#94a3b8', marginBottom: 8, fontSize:12, textTransform:'uppercase', fontWeight:'bold' },
    noteInput: { backgroundColor: '#0f172a', color: '#fff', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#475569', marginBottom: 10, fontSize: 13 },
    buttonsRow: { flexDirection: 'row', gap: 10 },
    voteBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
    btnOutline: { borderColor: '#475569', backgroundColor: 'transparent' },
    btnYesSelected: { backgroundColor: '#10b981', borderColor: '#10b981' }, 
    btnNoSelected: { backgroundColor: '#ef4444', borderColor: '#ef4444' }, 
    btnText: { color: '#94a3b8', fontWeight: 'bold', fontSize:13 },
    
    adminView: { marginTop: 15, backgroundColor: '#0f172a', padding: 12, borderRadius: 8 },
    adminTitle: { color: '#8b5cf6', fontSize: 11, fontWeight: 'bold', marginBottom: 5 },
    rowCandidate: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
    
    // NUOVO STILE PULITO (ex rocketBtn)
    assignBtn: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: '#22d3ee', // Azzurro Ciano (pulito)
        paddingHorizontal: 10, 
        paddingVertical: 6, 
        borderRadius: 6, // Meno arrotondato, più tecnico
    },
    assignBtnText: {
        color: '#000',
        fontWeight: 'bold',
        fontSize: 11,
        marginRight: 4
    },
    
    feedbackContainer: { marginTop: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',backgroundColor: 'rgba(76, 175, 80, 0.15)',padding: 8,borderRadius: 8,borderWidth: 1,borderColor: 'rgba(76, 175, 80, 0.5)'},
    feedbackText: { color: '#4CAF50', fontSize: 12, fontWeight: 'bold',textTransform: 'uppercase'},
});