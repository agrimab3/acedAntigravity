"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { MOCK_TEST_DEV_PROVIDER_ID } from "@/lib/mockTest/testStudents";
import styles from "../dev.module.css";

type Student = {
  id: string;
  name: string;
  email: string;
};

export default function StudentPicker({
  students,
  returnTo,
}: {
  students: readonly Student[];
  returnTo: string;
}) {
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  const chooseStudent = async (student: Student) => {
    if (busyEmail) return;
    setBusyEmail(student.email);

    const result = await signIn(MOCK_TEST_DEV_PROVIDER_ID, {
      student: student.email,
      callbackUrl: returnTo,
      redirect: true,
    });

    if (result?.error) {
      setBusyEmail(null);
    }
  };

  return (
    <>
      <div className={styles.studentList}>
        {students.map((student) => (
          <button
            key={student.email}
            type="button"
            className={styles.studentButton}
            onClick={() => void chooseStudent(student)}
            disabled={Boolean(busyEmail)}
          >
            <span className={styles.initialCircle} aria-hidden="true">
              {student.name[0]}
            </span>
            <span className={styles.studentText}>
              <strong>{student.name}</strong>
              <span>{student.email}</span>
            </span>
            <span className={styles.arrow} aria-hidden="true">
              →
            </span>
          </button>
        ))}
      </div>

      <a href={returnTo} className={styles.cancelLink}>
        cancel
      </a>
    </>
  );
}
