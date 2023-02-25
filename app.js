const express = require("express");
const axios = require("axios");
const admin = require("firebase-admin");
const serviceAccount = require("./Firebase_key.json");

const app = express();

// Firebase Admin SDK 초기화
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // databaseURL: "https://YOUR_PROJECT_ID.firebaseio.com",
});

// FCM 메시지 생성 함수
function createFCMMessage(topic, subject, classNum, period) {
  return {
    notification: {
      title: `오늘의 ${classNum}반 시간표`,
      body: `${period}교시: ${subject}`,
    },
    topic: topic,
  };
}

function getPeriod(hour) {
  if (hour < 8 || hour > 17) {
    return null;
  }
  return hour - 7;
}

// 알림 전송 함수
async function sendNotification(topic, message) {
  try {
    await admin.messaging().send(message);
    console.log(`Notification sent to topic "${topic}".`);
  } catch (error) {
    console.error(`Error sending notification to topic "${topic}":`, error);
  }
}

// 매 시 50분에 알림 전송
setInterval(async () => {
  const currentTime = new Date();
  const year = currentTime.getFullYear();
  const month = currentTime.getMonth() + 1;
  const day = currentTime.getDate();

  // 한자리 숫자일 경우 앞에 0 붙이기
  const formattedMonth = month < 10 ? `0${month}` : `${month}`;
  const formattedDay = day < 10 ? `0${day}` : `${day}`;

  const formattedDate = `${year}${formattedMonth}${formattedDay}`;
  // const formattedDate = "20220321";

  if (currentTime.getHours() === 23) {
    console.log(`Sending notifications for ${currentTime}.`);

    // 1학년 1반부터 3학년 10반까지의 시간표를 조회하고 알림 전송
    for (let grade = 1; grade <= 3; grade++) {
      for (let classNum = 1; classNum <= 10; classNum++) {
        const queryParams = {
          KEY: "neis-api-key",
          Type: "json",
          // pIndex: 1,
          pSize: 220,
          ATPT_OFCDC_SC_CODE: "J10",
          SD_SCHUL_CODE: "7531328",
          TI_FROM_YMD: formattedDate,
          TI_TO_YMD: formattedDate,
          // AY: 2022,
          // SEM: 1,
          // GRADE: grade,
          // CLASS_NM: `${grade}${classNum}`,
        };
        const url = "https://open.neis.go.kr/hub/hisTimetable";
        try {
          const response = await axios.get(url, { params: queryParams });
          const data = response.data;
          if (data.hisTimetable[0].head[1].RESULT.CODE === "INFO-000") {
            // 조회된 데이터 중 학년, 반, 교시, 과목만 저장하고 알림 전송
            const subjectList = data.hisTimetable[1].row.map(
              ({ ITRT_CNTNT, PERIO }) => ({
                subject: ITRT_CNTNT,
                period: PERIO,
              })
            );
            for (const { subject, period } of subjectList) {
              const hour = currentTime.getHours();
              if (Number(period) === getPeriod(hour)) {
                const topic = `${grade}${classNum}`;
                const message = createFCMMessage(
                  topic,
                  subject,
                  classNum,
                  period
                );
                console.log(message);
                sendNotification(topic, message);
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
  }
}, 10000);

// 서버 시작
const port = 3000;
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
