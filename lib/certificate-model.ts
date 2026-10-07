export const certificateNumberPattern = /^RS-\d{4}-[A-F0-9]{32}$/;
export type Certificate = {
  number: string;
  courseId: string;
  classId: string;
  courseVersion: number;
  recipientName: string;
  courseTitle: string;
  className: string;
  issuedAt: string;
  revokedAt: string | null;
};
export type CertificateStatus = {
  enabled: boolean;
  recipientName: string;
  lessons: {
    id: string;
    title: string;
    complete: boolean;
    quizPassed: boolean;
    codePassed: boolean;
  }[];
  classes: {
    id: string;
    name: string;
    tasks: {
      id: string;
      title: string;
      accepted: boolean;
    }[];
    eligible: boolean;
    certificate: Certificate | null;
  }[];
};
export function certificateDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(new Date(value));
}
