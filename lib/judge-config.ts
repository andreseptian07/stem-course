import {validateConfig,type JudgeConfig} from "./judge.ts";

export function configuredJudge(environment:Record<string,string|undefined>):JudgeConfig|null {
  if(environment.JUDGE0_ENABLED!=="true"||!environment.JUDGE0_URL)return null;
  const config:JudgeConfig={
    url:environment.JUDGE0_URL,token:environment.JUDGE0_TOKEN,
    apiKey:environment.JUDGE0_API_KEY,apiHost:environment.JUDGE0_API_HOST,
    languageIds:{python:Number(environment.JUDGE0_PYTHON_ID||71),javascript:Number(environment.JUDGE0_JAVASCRIPT_ID||63),cpp:Number(environment.JUDGE0_CPP_ID||54)},
  };
  try {validateConfig(config);return config;} catch {return null;}
}
