import {
  DocumentData,
  FieldValue,
  PartialWithFieldValue,
  QueryDocumentSnapshot,
  Timestamp,
  deleteField,
} from '@angular/fire/firestore';
import { dataObjectConverter } from './firestore-helper';

// A test interface to represent our application's data model.
interface TestModel {
  id: string;
  name: string;
  eventDate: Date;
  nested: {
    value: number;
    anotherDate?: Date;
  };
  tags: (string | undefined)[];
  participants: { name: string; joined: Date }[];
  optionalField?: string;
  fieldToBeUndefined?: string | undefined;
}

describe('FirestoreHelper', () => {
  describe('mappedConverter', () => {
    // Get an instance of the converter for our test model.
    const converter = dataObjectConverter<TestModel>();

    // --- Test Data Setup ---
    const testDate1 = new Date('2023-10-27T10:00:00Z');
    const testDate2 = new Date('2023-10-28T12:00:00Z');
    const testDate3 = new Date('2023-10-26T08:00:00Z');
    const testDate4 = new Date('2023-10-26T09:00:00Z');

    // This represents the data in our Angular application.
    // It uses JavaScript `Date` objects and `undefined` for missing values.
    const appModel: TestModel = {
      id: 'test1',
      name: 'Test Event',
      eventDate: testDate1,
      nested: {
        value: 123,
        anotherDate: testDate2,
      },
      tags: ['test', 'angular', undefined],
      participants: [
        { name: 'Alice', joined: testDate3 },
        { name: 'Bob', joined: testDate4 },
      ],
      optionalField: 'present',
      fieldToBeUndefined: undefined,
    };

    // This represents how the same data looks when stored in Firestore.
    // It uses Firestore `Timestamp` objects and `null` for missing values.
    const firestoreData: DocumentData = {
      name: 'Test Event',
      eventDate: Timestamp.fromDate(testDate1),
      nested: {
        value: 123,
        anotherDate: Timestamp.fromDate(testDate2),
      },
      tags: ['test', 'angular', null],
      participants: [
        { name: 'Alice', joined: Timestamp.fromDate(testDate3) },
        { name: 'Bob', joined: Timestamp.fromDate(testDate4) },
      ],
      optionalField: 'present',
      fieldToBeUndefined: null,
    };

    // --- Test Suites ---

    describe('fromFirestore', () => {
      it('should correctly convert Firestore data to the application model', () => {
        // Create a mock snapshot that Firestore would return.
        const mockSnapshot = {
          id: 'test1',
          data: () => ({ ...firestoreData }),
        } as QueryDocumentSnapshot<DocumentData>;

        const result = converter.fromFirestore(mockSnapshot);

        // The `toAppModel` function converts `null` to `undefined`.
        const expectedAppModel = { ...appModel };

        // Using `toEqual` for deep object comparison.
        expect(result).toEqual(expectedAppModel);

        // Also, explicitly check that the Timestamps were converted to Dates.
        expect(result.eventDate).toBeInstanceOf(Date);
        expect(result.nested.anotherDate).toBeInstanceOf(Date);
        expect(result.participants[0].joined).toBeInstanceOf(Date);
      });
    });

    describe('toFirestore', () => {
      it('should correctly convert the application model to Firestore data for a full write', () => {
        const result = converter.toFirestore(appModel);

        // For a full write, `undefined` should be converted to `null`.
        const expectedFirestoreData = { ...firestoreData };

        expect(result).toEqual(expectedFirestoreData);

        // Also, explicitly check that the Dates were converted to Timestamps.
        expect(result['eventDate']).toBeInstanceOf(Timestamp);
        expect(result['nested'].anotherDate).toBeInstanceOf(Timestamp);
        expect(result['participants'][0].joined).toBeInstanceOf(Timestamp);
      });

      it('should omit undefined fields for a partial write (merge)', () => {
        const partialAppModel: Partial<TestModel> = {
          name: 'Updated Name',
          fieldToBeUndefined: undefined, // This should be stripped out
        };

        // The `options` object being present signals a partial write.
        const result = converter.toFirestore(partialAppModel, { merge: true });

        const expectedFirestoreData = {
          name: 'Updated Name',
        };

        expect(result).toEqual(expectedFirestoreData);
        expect(Object.keys(result)).not.toContain('fieldToBeUndefined');
      });

      it('should translate explicit null to deleteField() for a partial write (merge)', () => {
        const partial = { optionalField: null } as unknown as PartialWithFieldValue<TestModel>;
        const result = converter.toFirestore(partial, { merge: true });
        expect(result['optionalField']).toEqual(deleteField());
        expect(result['optionalField']).toBeInstanceOf(FieldValue);
      });

      it('should translate nested null to deleteField in partial write', () => {
        const partial = {
          nested: { value: 1, anotherDate: null },
        } as unknown as PartialWithFieldValue<TestModel>;
        const result = converter.toFirestore(partial, { merge: true });
        expect(result['nested'].value).toBe(1);
        expect(result['nested'].anotherDate).toEqual(deleteField());
      });
    });
  });
});