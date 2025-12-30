//MostroRivoluzionario.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, Alert, Platform, KeyboardAvoidingView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { db, auth } from './firebaseConfig';
import { collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, query, orderBy, getDoc } from 'firebase/firestore';

// --- COMPONENTE CARD SEPARATO (Per gestire lo stato della nota singolarmente) ---
// --- COMPONENTE CARD SEPARATO (AGGIORNATO CON FEEDBACK) ---
const ShiftCard = ({ item, userRole, currentUser, onDelete, onVote }) => {
    const [myNote, setMyNote] = useState('');
    
    // Recuperiamo il voto esistente
    const myVoteData = item.availabilities?.[currentUser?.uid];
    const myStatus = myVoteData?.status;

    useEffect(() => {
        if (myVoteData?.note) {
            setMyNote(myVoteData.note);
        }
    }, []);

    const yesList = item.availabilities 
        ? Object.values(item.availabilities).filter(v => v.status === 'YES')
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
                    {item.note ? <Text style={styles.noteText}>📝 {item.note}</Text> : null}
                </View>

            {/* ORA ANCHE L'ADMIN PUÒ CANCELLARE */}
                {(userRole === 'FOUNDER' || userRole === 'AMMINISTRATORE') && (
                    <TouchableOpacity onPress={() => onDelete(item.id)} style={{marginLeft:10}}>
                        <Feather name="trash-2" size={22} color="#ef4444" />
                    </TouchableOpacity>
                )}
            </View>

            {/* SEZIONE VOTO */}
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

                    {/* --- NUOVO FEEDBACK VISIVO --- */}
                    {myStatus && (
                        <View style={styles.feedbackContainer}>
                            <Feather name="check-circle" size={16} color="#4CAF50" style={{marginRight:6}} />
                            <Text style={styles.feedbackText}>
                                RISPOSTA REGISTRATA: <Text style={{color:'#FFF'}}>{myStatus === 'YES' ? 'PRESENTE' : 'ASSENTE'}</Text>
                            </Text>
                        </View>
                    )}
                </View>
            )}

            {/* LISTA PRESENTI (Founder/Admin) */}
            {(userRole === 'FOUNDER' || userRole === 'AMMINISTRATORE') && (
                <View style={styles.adminView}>
                    <Text style={styles.adminTitle}>DISPONIBILITÀ ({yesList.length}):</Text>
                    {yesList.length > 0 ? (
                        <View>
                            {yesList.map((entry, index) => (
                                <Text key={index} style={styles.namesList}>
                                    • <Text style={{fontWeight:'bold'}}>{entry.name}</Text>
                                    {entry.note ? <Text style={{color:'#94a3b8', fontStyle:'italic'}}> ({entry.note})</Text> : ''}
                                </Text>
                            ))}
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
    
    // Campi Creazione
    const [newDate, setNewDate] = useState('');
    const [newStartTime, setNewStartTime] = useState('');
    const [newEndTime, setNewEndTime] = useState('');
    const [newLocation, setNewLocation] = useState('');
    const [newNote, setNewNote] = useState('');
    
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

    // FOUNDER: Crea Previsione
    const handleCreate = async () => {
        if (!newDate.trim() || !newLocation.trim() || !newStartTime.trim()) { 
            Alert.alert("Mancano dati", "Inserisci almeno Data, Orari e Luogo!"); 
            return; 
        }

        setLoading(true);
        try {
            await addDoc(collection(db, "provisional_shifts"), {
                dateText: newDate,
                startTimeText: newStartTime,
                endTimeText: newEndTime,
                locationText: newLocation,
                note: newNote,
                createdAt: new Date(),
                availabilities: {} 
            });
            setNewDate(''); setNewStartTime(''); setNewEndTime(''); setNewLocation(''); setNewNote('');
            if(Platform.OS === 'web') alert("Pubblicato!"); else Alert.alert("Pubblicato!", "La richiesta è online.");
        } catch (e) {
            Alert.alert("Errore", e.message);
        }
        setLoading(false);
    };

    // VOTAZIONE CON NOTA
    const handleVote = async (shiftId, status, noteText) => {
        const shiftRef = doc(db, "provisional_shifts", shiftId);
        const userSnap = await getDoc(doc(db, "users", currentUser.uid));
        const userData = userSnap.data();
        const fullName = userData ? `${userData.firstName} ${userData.lastName}` : "Utente";

        try {
            const updateKey = `availabilities.${currentUser.uid}`;
            await updateDoc(shiftRef, {
                [updateKey]: { 
                    status: status, 
                    name: fullName,
                    note: noteText // <--- SALVIAMO LA NOTA QUI
                }
            });
        } catch (e) {
            console.error(e);
            Alert.alert("Errore", "Impossibile aggiornare.");
        }
    };

    // ELIMINA (Founder)
    const handleDelete = async (id) => {
        const doDelete = async () => await deleteDoc(doc(db, "provisional_shifts", id));
        if (Platform.OS === 'web') {
            if (confirm("Vuoi eliminare questa richiesta?")) doDelete();
        } else {
            Alert.alert("Elimina", "Vuoi rimuovere questa richiesta?", [
                { text: "No" }, { text: "Sì", onPress: doDelete }
            ]);
        }
    };

    return (
        <KeyboardAvoidingView 
            style={styles.container} 
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Feather name="arrow-left" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Bacheca Previsionale</Text>
            </View>

            {/* BOX CREAZIONE (Solo Founder) */}
            {(userRole === 'FOUNDER' || userRole === 'AMMINISTRATORE') && (
                <View style={styles.createBox}>
                    <Text style={styles.createTitle}>Nuova Previsione</Text>
                    <TextInput style={[styles.input, {marginBottom:10}]} placeholder="Data (es. 15/08/2026)" placeholderTextColor="#94a3b8" value={newDate} onChangeText={setNewDate}/>
                    <View style={{flexDirection:'row', gap:10, marginBottom:10}}>
                        <TextInput style={[styles.input, {flex:1}]} placeholder="Inizio (18:00)" placeholderTextColor="#94a3b8" value={newStartTime} onChangeText={setNewStartTime}/>
                        <TextInput style={[styles.input, {flex:1}]} placeholder="Fine (04:00)" placeholderTextColor="#94a3b8" value={newEndTime} onChangeText={setNewEndTime}/>
                    </View>
                    <TextInput style={[styles.input, {marginBottom:10}]} placeholder="Luogo (es. Stadio San Siro)" placeholderTextColor="#94a3b8" value={newLocation} onChangeText={setNewLocation}/>
                    <View style={{flexDirection:'row', gap:10}}>
                        <TextInput style={[styles.input, {flex:1}]} placeholder="Note extra (es. Abito scuro)" placeholderTextColor="#94a3b8" value={newNote} onChangeText={setNewNote}/>
                        <TouchableOpacity style={styles.pubBtn} onPress={handleCreate} disabled={loading}>
                            <Feather name="send" size={20} color="#0f172a" />
                        </TouchableOpacity>
                    </View>
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
    createBox: { backgroundColor: '#1e293b', padding: 15, borderRadius: 12, marginBottom: 25, borderColor: '#8b5cf6', borderWidth: 1 },
    createTitle: { color: '#8b5cf6', fontWeight: 'bold', marginBottom: 10, textTransform:'uppercase', fontSize:12 },
    input: { backgroundColor: '#0f172a', color: '#fff', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#334155' },
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
    namesList: { color: '#fff', fontSize: 13, lineHeight: 22 },
    feedbackContainer: { marginTop: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',backgroundColor: 'rgba(76, 175, 80, 0.15)',padding: 8,borderRadius: 8,borderWidth: 1,borderColor: 'rgba(76, 175, 80, 0.5)'},
    feedbackText: { color: '#4CAF50', fontSize: 12, fontWeight: 'bold',textTransform: 'uppercase'},
});
