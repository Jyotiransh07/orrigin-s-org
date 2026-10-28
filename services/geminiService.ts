import { SuggestionResponse } from '../types';

export const getDoctorSpecialization = async (symptoms: string): Promise<SuggestionResponse> => {
  try {
    const response = await fetch('/api/triage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ symptoms }),
    });

    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }

    const data = await response.json();
    return data as SuggestionResponse;
  } catch (error) {
    console.error('Error getting doctor specialization:', error);
    return {
      specialization: 'General Physician',
      reason: 'Your symptoms require a clinical assessment. A General Physician is the best first contact for a physical examination and diagnostic roadmap.',
      urgency: 'medium',
      redFlags: ['Sudden severe pain', 'Shortness of breath', 'Fainting', 'Severe allergic reaction'],
    };
  }
};
