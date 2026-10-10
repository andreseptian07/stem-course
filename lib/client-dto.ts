import type {Course, Session} from "./model";
export type ClassSummary = {
  id:string;name:string;description:string;courseId:string;courseTitle:string;mentorName:string;
  mentorId?:string|null;mentorGrantVersion?:number;startsAt:string|null;endsAt:string|null;
  capacity:number;count:number;status:"open"|"active"|"archived";version:number;membership:string|null;isMentor:boolean;isStaff:boolean;published:boolean;
};
export type ClassList = {
  user:{id:string;name:string;role:string;kind:"student"|"staff"};classes:ClassSummary[];
  courses:{id:string;title:string;published:boolean}[];
  mentors:{id:string;name:string;grantVersion:number}[];
  users:{id:string;name:string}[];
};
export type ClassSession = {id:string;title:string;kind:"online"|"offline";startsAt:string;duration:number;location:string;url:string;version:number};
export type ClassDetail = {
  class:ClassSummary;user:ClassList["user"];
  members?:{userId:string;name:string;status:string;createdAt:string;progress?:{percent:number;completed:number;total:number;stale:number};lessons?:{id:string;title:string;complete:boolean;quizPassed:boolean;codePassed:boolean;quizAttempts:number;codeAttempts:number}[]}[];
  sessions?:ClassSession[];
  feedback?:{id:string;studentId:string;studentName:string;mentorName:string;body:string;createdAt:string}[];
  posts?:{id:string;name:string;role:string;kind:string;body:string;createdAt:string}[];
};
export type AdminStudio = {
  courses:Course[];sessions:Session[];users:{id:string;name:string;role:string}[];judgeReady:boolean;
  progress:{user_id:string;course_id:string;lesson_id:string;name:string;revision:number;complete:number;score:number;quiz_attempts:number;code_attempts:number}[];
};
