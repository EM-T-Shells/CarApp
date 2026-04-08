import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface LiveMapProps {
  pickupAddress: string;
  dropoffAddress: string;
}

export function LiveMap({ pickupAddress, dropoffAddress }: LiveMapProps) {
  return (
    <View style={styles.container}>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Live Map Coming Soon</Text>
      </View>
      <View style={styles.addressContainer}>
        <Text style={styles.label}>Pickup</Text>
        <Text style={styles.address}>{pickupAddress}</Text>
        <Text style={styles.label}>Dropoff</Text>
        <Text style={styles.address}>{dropoffAddress}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  placeholder: {
    height: 250,
    backgroundColor: '#F7F8FC',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
  },
  placeholderText: {
    fontFamily: 'SpaceGrotesk-Medium',
    fontSize: 18,
    color: '#777777',
  },
  addressContainer: {
    paddingVertical: 16,
    gap: 4,
  },
  label: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: '#777777',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
  },
  address: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: '#222222',
  },
});
