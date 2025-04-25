import json
import logging
import os
# Configure logging
LOGLEVEL = os.environ.get("LOGLEVEL", "INFO").upper()
logging.basicConfig(level=LOGLEVEL, format="%(asctime)s %(message)s")
logger = logging.getLogger(__name__)
RUNNING_IN_DEV_MODE = os.environ.get("DEV_MODE", "False").lower() == "true"


class PatientDBService:
    _instance = None
    _patient_data = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(PatientDBService, cls).__new__(cls)
            cls._load_data()
        return cls._instance

    @classmethod
    def _load_data(cls):
        """Load JSON data from file only once"""
        try:
            with open("data/patients.json", "r") as file:
                cls._patient_data = json.load(file)
                print("Patient data loaded successfully")
        except Exception as e:
            print(f"Error loading patient data: {e}")
            cls._patient_data = {"patients": []}

    @classmethod
    def get_patient_by_id(cls, patient_id: str) -> dict:
        """
        Get patient data by ID from cached data

        Args:
            patient_id (str): The patient ID to search for

        Returns:
            dict: patient data if found, empty dict if not found
        """
        if cls._patient_data is None:
            cls._load_data()

        for patient in cls._patient_data.get("patients", []):
            if patient.get("patientId") == patient_id:
                return patient

        return {}
    
    @classmethod
    def get_patient_by_name(cls, patient_name: str) -> dict:
        """
        Get patient data by name from cached data

        Args:
            patient_name (str): The patient name to search for

        Returns:
            dict: patient data if found, empty dict if not found
        """
        if cls._patient_data is None:
            cls._load_data()

        for patient in cls._patient_data.get("patients", []):
            if patient.get("Name").lower() == patient_name.lower():
                return patient

        return None
    


# Example usage:
def get_patient(patient_name: str) -> dict:
    """Convenience function to get patient data"""
    return PatientDBService.get_patient_by_name(patient_name)


# Usage example:
if __name__ == "__main__":
    # The file is loaded only once when first accessed
    patient1 = get_patient("Elysabeth Vasilevna")
    print(json.dumps(patient1, indent=2))

    # Subsequent calls use cached data
    patient2 = get_patient("Jaime Lopez") 
    print(json.dumps(patient2, indent=2))
     
