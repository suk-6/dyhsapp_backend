const express = require("express");
const axios = require("axios");
const admin = require("firebase-admin");
const serviceAccount = require("./key.json");
const neis_api = require("./neis-api.json");

const app = express();

// Firebase Admin SDK 초기화
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // databaseURL: "https://YOUR_PROJECT_ID.firebaseio.com",
});

// FCM 메시지 생성 함수
const createFCMMessage = (topic, subject, grade, classNum, period) => {
  return {
    notification: {
      title: `오늘의 ${grade}학년 ${classNum}반 시간표`,
      body: `${period}교시: ${subject}`,
    },
    topic: topic,
  };
}

const getPeriod = (hour) => {
  if (hour < 8 || hour > 17) {
    return null;
  }
  return hour - 7;
}

// 알림 전송 함수
const sendNotification = async (topic, message) => {
  try {
    await admin.messaging().send(message);
    console.log(`Notification sent to topic "${topic}".`);
  } catch (error) {
    console.error(`Error sending notification to topic "${topic}":`, error);
  }
}

const apicall = async (Date) => {
  const queryParams = {
    KEY: neis_api.neisKey,
    Type: "json",
    // pIndex: 1,
    pSize: 220,
    ATPT_OFCDC_SC_CODE: neis_api.OECODE,
    SD_SCHUL_CODE: neis_api.SCCODE,
    TI_FROM_YMD: Date,
    TI_TO_YMD: Date,
    // GRADE: grade,
    // CLASS_NM: classNum,
    // AY: 2022,
    // SEM: 1,
  };

  const url = "https://open.neis.go.kr/hub/hisTimetable";

  const response = await axios.get(url, { params: queryParams });
  return response.data;
}

const scheduleNotification = () => {
  const currentTime = new Date();
  const targetTimes = [
    { hour: 8, minute: 50 },
    { hour: 9, minute: 50 },
    { hour: 10, minute: 50 },
    { hour: 11, minute: 50 },
    { hour: 13, minute: 40 },
    { hour: 14, minute: 40 },
    { hour: 15, minute: 40 }
  ];

  const nextNotificationTime = targetTimes.find(
    ({ hour, minute }) =>
      currentTime.getHours() < hour ||
      (currentTime.getHours() === hour && currentTime.getMinutes() < minute)
  );

  if (nextNotificationTime) {
    const timeDiff =
      nextNotificationTime.hour * 60 +
      nextNotificationTime.minute -
      (currentTime.getHours() * 60 + currentTime.getMinutes());
    const delay = timeDiff * 60 * 1000;

    setTimeout(readyNotification, delay, currentTime);
  }
}

const readyNotification = async (currentTime) => {
  const year = currentTime.getFullYear();
  const month = currentTime.getMonth() + 1;
  const day = currentTime.getDate();

  // 한자리 숫자일 경우 앞에 0 붙이기
  const formattedMonth = month < 10 ? `0${month}` : `${month}`;
  const formattedDay = day < 10 ? `0${day}` : `${day}`;

  // const formattedDate = `${year}${formattedMonth}${formattedDay}`;
  const formattedDate = "20220321";

  console.log(`Sending notifications for ${currentTime}.`);
  const data = await apicall(formattedDate);
  // 1학년 1반부터 3학년 10반까지의 시간표를 조회하고 알림 전송
  for (let grade = 1; grade <= 3; grade++) {
    for (let classNum = 1; classNum <= 10; classNum++) {
      try {
        if (data.hisTimetable[0].head[1].RESULT.CODE === "INFO-000") {
          // 조회된 데이터 중 학년, 반, 교시, 과목만 저장하고 알림 전송
          const subjectList = data.hisTimetable[1].row.map(
            ({ GRADE, CLASS_NM, ITRT_CNTNT, PERIO }) => ({
              APIgrade: GRADE,
              APIclassNum: CLASS_NM,
              subject: ITRT_CNTNT,
              period: PERIO,
            })
          );
          console.log(subjectList);
          for (const {
            APIgrade,
            APIclassNum,
            subject,
            period,
          } of subjectList) {
            // const hour = currentTime.getHours();
            const hour = 9;
            if (Number(period) === getPeriod(hour)) {
              if (
                grade === Number(APIgrade) &&
                classNum === Number(APIclassNum)
              ) {
                const topic = `${grade}-${classNum}`;
                const message = createFCMMessage(
                  topic,
                  subject,
                  APIgrade,
                  APIclassNum,
                  period
                );
                console.log(message);
                sendNotification(topic, message);
              }
            }
          }
        } else {
          console.error(
            `Error getting timetable data for grade ${grade}, class ${classNum}.`
          );
        }
      } catch (error) {
        console.error(
          `Error getting timetable data for grade ${grade}, class ${classNum}:`,
          error
        );
      }
    }
  }
  scheduleNotification();
}

// 초기 실행
readyNotification();
// scheduleNotification();

// 서버 시작
const port = 3000;
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
