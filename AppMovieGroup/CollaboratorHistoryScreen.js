//CollaboratorHistory.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, StatusBar, Platform, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { db, auth } from './firebaseConfig';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

const Colors = {
    background: '#000000', surface: '#1C1C1E', textMain: '#FFFFFF', textSub: '#8E8E93',
    primary: '#4CAF50', accent: '#0A84FF', border: '#2C2C2E', success: '#34C759'
};

export default function CollaboratorHistoryScreen({ onBack }) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState(''); // <--- Per la ricerca

    useEffect(() => {
        const user = auth.currentUser;
        if (!user) return;

        // FILTRO: Solo i miei turni completati (ultimi 30 giorni per velocità)
        const today = new Date();
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - 60);
        const pastDateStr = pastDate.toISOString().split('T')[0];

        const q = query(
            collection(db, "shifts"),
            where("collaboratorId", "==", user.uid),
            where("status", "==", "completato"),
            where("date", ">=", pastDateStr)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Ordina dal più recente
            data.sort((a, b) => new Date(b.date) - new Date(a.date));
            setHistory(data);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const renderItem = ({ item }) => (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <Text style={styles.shiftTitle}>{item.location}</Text>
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>COMPLETATO ✅</Text>
                </View>
            </View>
            
            <View style={{flexDirection:'row', alignItems:'center', marginBottom: 5}}>
                <Feather name="calendar" size={14} color={Colors.textSub} style={{marginRight:5}} />
                <Text style={styles.shiftDate}>{item.date}</Text>
            </View>

            <View style={styles.detailBox}>
                <Text style={styles.detailLabel}>Orario:</Text>
                <Text style={styles.detailValue}>{item.startTime} - {item.endTime}</Text>
            </View>
             <View style={styles.detailBox}>
                <Text style={styles.detailLabel}>Luogo:</Text>
                <Text style={[styles.detailValue, {color: Colors.accent}]}>{item.location}</Text>
            </View>
        </View>
    );

    // Filtriamo i turni in base alla ricerca (Data o Luogo)
    const filteredHistory = history.filter(item => 
        (item.location || '').toLowerCase().includes(searchText.toLowerCase()) ||
        (item.date || '').includes(searchText)
    );

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
            
            {/* HEADER SENZA PDF */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backButton}>
                    <Feather name="arrow-left" size={24} color={Colors.textMain} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>STORICO TURNI</Text>
                {/* Qui a destra non c'è più nulla */}
                <View style={{width: 24}} /> 
            </View>
{/* BARRA DI RICERCA */}
            <View style={styles.searchContainer}>
                <Feather name="search" size={18} color={Colors.textSub} style={{marginRight: 10}} />
                <TextInput 
                    style={styles.searchInput}
                    placeholder="Cerca per data o luogo..."
                    placeholderTextColor={Colors.textSub}
                    value={searchText}
                    onChangeText={setSearchText}
                />
                {searchText.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchText('')}>
                        <Feather name="x" size={18} color={Colors.textSub} />
                    </TouchableOpacity>
                )}
            </View>
            {loading ? (
                <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 50 }} />
            ) : (
                <FlatList
                    data={filteredHistory}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={{ padding: 20 }}
                    ListEmptyComponent={
                        <View style={{ alignItems: 'center', marginTop: 50 }}>
                            <Feather name="clock" size={50} color={Colors.textSub} />
                            <Text style={styles.emptyText}>Nessun turno completato di recente.</Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: Colors.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.textMain, letterSpacing: 1 },
    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 15, borderWidth: 1, borderColor: Colors.border },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    shiftTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textMain },
    shiftDate: { color: Colors.textSub, fontSize: 14 },
    badge: { paddingHorizontal: 8, paddingVertical: 4 },
    badgeText: { color: Colors.success, fontSize: 10, fontWeight: 'bold' },
    detailBox: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5, padding: 10, backgroundColor: '#000', borderRadius: 8 },
    detailLabel: { color: Colors.textSub, fontSize: 12, fontWeight: 'bold' },
    detailValue: { color: Colors.textMain, fontSize: 12, fontWeight: 'bold' },
    emptyText: { color: Colors.textSub, marginTop: 10, fontStyle: 'italic' },
    // STILI PER LA RICERCA
    searchContainer: {flexDirection: 'row',alignItems: 'center',
    backgroundColor: Colors.surface,margin: 15,paddingHorizontal: 15,
    borderRadius: 10,height: 45,borderWidth: 1,borderColor: Colors.border},
    searchInput: {flex: 1,color: Colors.textMain,fontSize: 14,},
});