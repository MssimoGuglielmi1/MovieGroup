// StoricoFounder.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator, Alert, Platform, TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { db } from './firebaseConfig';
import { collection, query, where, onSnapshot, writeBatch, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { calculateFiscalData } from './CalcolatriceFiscale';
import WelcomeModal from './WelcomeModal';

const Colors = {
    background: '#000000', surface: '#1C1C1E', textMain: '#FFFFFF', textSub: '#8E8E93',
    primary: '#4CAF50', accent: '#0A84FF', gold: '#EAB308', border: '#2C2C2E', purple: '#BF5AF2', error: '#FF453A',
    selectedBg: '#3a1e1e', selectedBorder: '#FF453A'
};

export default function StoricoFounder({ navigation }) {
    const [shifts, setShifts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalCost, setTotalCost] = useState(0);
    const [searchText, setSearchText] = useState('');
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    const [showGuide, setShowGuide] = useState(false);

    useEffect(() => {
        const q = query(
            collection(db, "shifts"),
            where("status", "==", "completato"),
            orderBy("date", "desc") // Dal più recente al più vecchio
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = [];
            let total = 0;

            snapshot.docs.forEach(doc => {
                const data = doc.data();
                
                // Usiamo la tua calcolatrice fiscale per coerenza
                const { cost } = calculateFiscalData(data);
                
                total += parseFloat(cost);
                
                list.push({
                    id: doc.id,
                    ...data,
                    realCost: cost
                });
            });

            setShifts(list);
            setTotalCost(total);
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    // --- GESTIONE SPUNTA (Seleziona/Deseleziona) ---
    const toggleSelection = (id) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(itemId => itemId !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const exitSelectionMode = () => {
        setIsSelectionMode(false);
        setSelectedIds([]);
    };

    // --- 3. CANCELLAZIONE SINGOLA (MANTENUTA - Long Press) ---
    const handleSingleDelete = (item) => {
        if (isSelectionMode) return; // Se stai selezionando, il long press è disattivato per non fare confusione

        Alert.alert(
            "ELIMINARE TURNO? ⚠️",
            `Vuoi cancellare definitivamente il turno di ${item.collaboratorName} del ${item.date}? Sparirà dal database.`,
            [
                { text: "Annulla", style: "cancel" },
                { 
                    text: "ELIMINA PER SEMPRE", 
                    style: "destructive", 
                    onPress: async () => {
                        try {
                            await deleteDoc(doc(db, "shifts", item.id));
                        } catch (e) { Alert.alert("Errore", e.message); }
                    }
                }
            ]
        );
    };

    // --- 4. CANCELLAZIONE DI MASSA (NUOVA FUNZIONE) ---
    const handleBulkDelete = () => {
        if (selectedIds.length === 0) return;

        Alert.alert(
            "CANCELLAZIONE MULTIPLA 🗑️",
            `Stai per eliminare definitivamente ${selectedIds.length} turni dal database Firestore.\nQuesta azione è irreversibile. Procedere?`,
            [
                { text: "Annulla", style: "cancel" },
                { 
                    text: "SÌ, PROCEDI", 
                    style: "destructive", 
                    onPress: async () => {
                        setLoading(true);
                        try {
                            const batch = writeBatch(db); // Prepara il "camion" della spazzatura
                            selectedIds.forEach(id => {
                                const ref = doc(db, "shifts", id);
                                batch.delete(ref); // Carica ogni turno nel camion
                            });
                            await batch.commit(); // Porta via tutto in un colpo solo
                            
                            exitSelectionMode();
                            Alert.alert("Fatto", "Pulizia completata con successo.");
                        } catch (e) {
                            Alert.alert("Errore", e.message);
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    if (loading) return (
        <View style={{flex:1, backgroundColor: Colors.background, justifyContent:'center', alignItems:'center'}}>
            <ActivityIndicator size="large" color={Colors.gold}/>
        </View>
    );

    // --- FILTRO RICERCA TATTICO ---
    const filteredShifts = shifts.filter(item => {
        const search = searchText.toLowerCase();
        return (
            (item.collaboratorName || '').toLowerCase().includes(search) ||
            (item.location || '').toLowerCase().includes(search) ||
            (item.date || '').includes(search)
        );
    });

return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
            
            {/* HEADER */}
            <View style={styles.header}>
                {/* SINISTRA: Freccia e Titolo */}
                <View style={{flexDirection:'row', alignItems:'center'}}>
                    <TouchableOpacity onPress={() => navigation.goBack()}>
                        <Feather name="arrow-left" size={24} color={Colors.textMain} />
                    </TouchableOpacity>
                    {isSelectionMode ? (
                        <Text style={{color: Colors.textMain, marginLeft:15, fontWeight:'bold', fontSize:16}}>
                            {selectedIds.length} Selezionati
                        </Text>
                    ) : (
                        <Text style={styles.title}>COSTI AZIENDALI</Text>
                    )}
                </View>

                {/* DESTRA: Tasti Azione */}
                <View style={{flexDirection:'row', alignItems:'center', gap: 20}}>
                    
                    {/* 1. TASTO CESTINO (Solo se selezioni) */}
                    {isSelectionMode && selectedIds.length > 0 && (
                        <TouchableOpacity onPress={handleBulkDelete}>
                            <Feather name="trash-2" size={24} color={Colors.error} />
                        </TouchableOpacity>
                    )}

                    {/* 2. TASTO SELEZIONA/ANNULLA */}
                    <TouchableOpacity onPress={isSelectionMode ? exitSelectionMode : () => setIsSelectionMode(true)}>
                        <Text style={{color: isSelectionMode ? Colors.textSub : Colors.gold, fontWeight:'bold', fontSize:14}}>
                            {isSelectionMode ? "ANNULLA" : "SELEZIONA"}
                        </Text>
                    </TouchableOpacity>

                    {/* 🔥🔥🔥 3. TASTO GUIDA (?) - QUI È IL POSTO GIUSTO! 🔥🔥🔥 */}
                    {!isSelectionMode && (
                        <TouchableOpacity onPress={() => setShowGuide(true)}>
                            <Feather name="help-circle" size={24} color={Colors.accent} />
                        </TouchableOpacity>
                    )}
                </View>
            </View> 

            {/* BARRA DI RICERCA */}
            <View style={styles.searchContainer}>
                <Feather name="search" size={20} color={Colors.textSub} style={{marginRight: 10}} />
                <TextInput 
                    style={styles.searchInput}
                    placeholder="Filtra per Data (es. 2026-01) o Nome..."
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

            {/* TOTALONE */}
            <View style={styles.summaryBox}>
                <Text style={styles.summaryLabel}>TOTALE STORICO (TUTTO)</Text>
                <Text style={styles.summaryValue}>€ {totalCost.toFixed(2)}</Text>
            </View>

            {/* LISTA */}
            <FlatList
                data={filteredShifts}
                keyExtractor={item => item.id}
                contentContainerStyle={{ padding: 20, paddingBottom: 50 }}
                renderItem={({ item }) => {
                    const isSelected = selectedIds.includes(item.id);
                    const isMinute = item.rateType === 'minute';
                    
                    return (
                        <TouchableOpacity 
                            onLongPress={() => handleSingleDelete(item)}
                            onPress={() => {
                                if (isSelectionMode) toggleSelection(item.id);
                            }}
                            activeOpacity={0.8}
                            style={[
                                styles.card, 
                                isSelected && { borderColor: Colors.selectedBorder, backgroundColor: Colors.selectedBg } 
                            ]}
                        >
                            <View style={styles.cardHeader}>
                                <View style={{flex: 1, flexDirection:'row', alignItems:'center'}}>
                                    {isSelectionMode && (
                                        <Feather 
                                            name={isSelected ? "check-circle" : "circle"} 
                                            size={20} 
                                            color={isSelected ? Colors.error : Colors.textSub} 
                                            style={{marginRight: 10}} 
                                        />
                                    )}
                                    <View>
                                        <Text style={styles.collabName}>{item.collaboratorName}</Text>
                                        <Text style={{color: Colors.textSub, fontSize:12, marginTop: 2}}>
                                            📅 {item.date}
                                        </Text>
                                        <Text style={styles.locationText}>{item.location}</Text>
                                    </View>
                                </View>
                                <View style={{alignItems:'flex-end'}}>
                                    <Text style={styles.moneyValue}>€ {item.realCost}</Text>
                                    <Text style={[styles.rateLabel, isMinute ? {color: Colors.gold} : {color: Colors.accent}]}>
                                        {isMinute ? `€${item.payoutRate}/min` : `€${item.payoutRate}/h`}
                                    </Text>
                                </View>
                            </View>
                            
                            <View style={styles.detailRow}>
                                <View>
                                    <Text style={{ color: Colors.textSub, fontSize:10 }}>PREVISTO</Text>
                                    <Text style={{ color: Colors.textSub, fontWeight:'bold' }}>{item.startTime} - {item.endTime}</Text>
                                </View>
                                {item.realStartTime && (
                                     <View style={{alignItems:'flex-end'}}>
                                        <Text style={{ color: Colors.primary, fontSize:10, textTransform:'uppercase' }}>
                                            Puntuale
                                        </Text>
                                        <Text style={{ color: Colors.textMain, fontWeight:'bold' }}>
                                            {new Date(item.realStartTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} - 
                                            {item.realEndTime ? new Date(item.realEndTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : "..."}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </TouchableOpacity>
                    );
                }}
            />

            {/* COMPONENTE GUIDA */}
            <WelcomeModal 
                visible={showGuide} 
                onClose={() => setShowGuide(false)} 
                userRole="COSTI_FOUNDER" 
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: Colors.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
    header: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
    title: { fontSize: 18, fontWeight: '900', color: Colors.textMain, letterSpacing: 1, marginLeft: 15 },
    summaryBox: { margin: 20, padding: 20, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.gold, alignItems: 'center' },
    summaryLabel: { color: Colors.gold, fontSize: 12, fontWeight: 'bold', marginBottom: 5 },
    summaryValue: { color: Colors.textMain, fontSize: 32, fontWeight: '900' },
    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 15, marginBottom: 15, borderWidth: 1, borderColor: Colors.border },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
    collabName: { color: Colors.textMain, fontSize: 16, fontWeight: 'bold' },
    locationText: { color: Colors.textSub, fontSize: 12, marginTop: 2 },
    moneyValue: { fontSize: 18, fontWeight: 'bold', color: Colors.primary },
    rateLabel: { fontSize: 10, fontStyle: 'italic', marginTop: 2 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#333', paddingTop: 10, marginTop: 5 },
    searchContainer: {flexDirection: 'row',alignItems: 'center',backgroundColor: Colors.surface,marginHorizontal: 20,marginTop: 15,paddingHorizontal: 15,borderRadius: 10,height: 45,borderWidth: 1,borderColor: Colors.border},
    searchInput: {flex: 1,color: Colors.textMain,fontSize: 14,fontWeight: 'bold'},
});
