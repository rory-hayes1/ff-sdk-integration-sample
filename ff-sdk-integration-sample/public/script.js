"use strict";

var sessionData;
var selectedFile;

const fileInput = document.getElementById("getDocument");
const spanResult = document.getElementById("spanResult");

const ACTION_CREATE_ENTITY = "CREATE_ENTITY";
var entityId;

fileInput.onchange = () => {
  selectedFile = fileInput.files[0];
  console.log(selectedFile);
  appendToFileInfo(`Selected file is : ${selectedFile.name} with size  ${(selectedFile.size / 1028).toFixed(2)}KB`);
};

function appendToFileInfo(text) {
  console.log(text);
  spanResult.textContent = spanResult.textContent + "\n" + text;
}

function actionCallback(action, data) {
  console.log(`actonCallback called with action : ${action} and data as : ${data}`);

  if(!action) {
    console.log("Undefined action received");
    return;
  }

  if (action == ACTION_CREATE_ENTITY) {
    const res = JSON.parse(data);
    entityId = res.entity.entityId;
    const msg = `Successfully fetched the entity id ${entityId}`;
    appendToFileInfo(msg);
    console.log(msg);
  } 
  
  else {
    console.log("Unsupported action received");
  }
}

function createEntity() {
  try {
    Android.performAction(ACTION_CREATE_ENTITY, JSON.stringify({
      entityProfile: "Default",
      entityType: "INDIVIDUAL",
      extraData: [
        {
          kvpKey: "consent.general",
          kvpValue: "true",
        },
      ],
      name: {
        givenName: "Test",
        familyName: "",
      },
    }) );
  } catch (e) {
    if (e instanceof ReferenceError) {
      alert("This method is not supported");
    }
  } 
}

function getSessionObject() {
  getSessionObjectWithEntityId(entityId);
}

function getSessionObjectWithEntityId(entity) {
  fetch("https://backend.latest.frankiefinancial.io/auth/v2/machine-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "machine MDI2M2E2YmQtOGNkZi1iNzRhLWJhYjUtNzAyMzg3MzQyYjQ5OjRjYzg1OTQ4LWE2OTYtNjFiZC02Yjk5LTFkYjgzZTNhNWI5OTo2OTc0OThjMTQ2OWZkY2YzZGJjYzdhN2FiMjFjMDEzYmQ5MTY3MWZhMjM5YzU2ZmRkYzFkZGFmZDA1NzQ4NGQ2",
    },
    body: JSON.stringify({
      permissions: {
        preset: "one-sdk",
        entityId: entity,
      },
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      // Process the response data
      console.log(data.token);
      sessionData = data;
      appendToFileInfo("Session token successfully created");
    })
    .catch((error) => {
      // Handle any errors
      console.error("Error:", error);
    });
}

async function startOneSDK() {
  const configuration = {
    session: sessionData,
  };
  const oneSdk = await OneSdk(configuration);
  const oneSdkIndividual = oneSdk.individual();
  const name = oneSdkIndividual.access("name");
  console.log(name, oneSdkIndividual);

  const ocr = oneSdk.component("ocr");

  ocr.on("input_required", async (inputInfo, status, callback) => {
    appendToFileInfo("input_required called");
    const { documentType, side } = inputInfo;

    // documentType will initially be null, until the type is inferred from the first provided scan
    if (documentType === "PASSPORT") {
      console.log("input_required : DocumentType is passport");
      // present UI to capture a passport image
    } else if (documentType === "DRIVERS_LICENCE") {
      // check which side of the drivers licence is required
      console.log("input_required : DocumentType is Driving Licence");
      if (side === "front") {
        // present UI to capture the licence's front side
        console.log("input_required : Document Side required is front");
      } else if (side === "back") {
        // present UI to capture the licence's back side
        console.log("input_required : DocumentType Side required is Back");
      }
    } else {
      // present UI to capture any type of identity document
      console.log("input_required : DocumentType is Unknown");
    }

    // Your use interface you should capture an image and provide it to OneSDK as a File object.
    // https://developer.mozilla.org/en-US/docs/Web/API/File
    //
    // For example, your interface may use the Image Capture API to obtain the image data, though use of this API is not required.
    // See https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Image_Capture_API
    // const blob = // ...
    // provideFile(blob)

    // example of capturing a blob image from browser
    // navigator.mediaDevices.getUserMedia({ video: true }).then((mediaStream) => {
    //   // Do something with the stream.
    //   const track = mediaStream.getVideoTracks()[0];
    //   let imageCapture = new ImageCapture(track);
    //   imageCapture.takePhoto().then((file) => callback(file));
    // });

    callback(selectedFile);
    // const blob = await fetch(selectedFile)
    //   //const blob = await fetch('./aus_passport.jpeg')
    //   .then((r) => r.blob())
    //   .then((blob) => callback(blob));
  });

  ocr.on("results", ({ document }) => {
    // Present the details of the document that were detected from the uploaded image or images.
    // Decide whether to proceed to the next stage of the onboarding process
    // depending on whether document verification was successful.
    if (document) {
      console.log(document);
      appendToFileInfo(document.idType);
      appendToFileInfo(document.idNumber);
      showAndroidToast("Ocr results received");
      appendToFileInfo("Ocr results received");
      startBiometric(oneSdk);
    } else {
      console.log("results with unknown document");
    }
  });

  ocr.on("error", (error) => {
    appendToFileInfo(error.message);
  });

  ocr.start();
}

function startBiometric(oneSdk) {
  const biometrics = oneSdk.component("biometrics");
  biometrics.on("results", ({ checkStatus, processing }) => {
    // Decide whether to proceed to the next stage of the onboarding process
    // depending on whether biometrics verification was successful.
    if (processing) {
      appendToFileInfo(`Biometrics result ${processing} ${checkStatus}`);
      const individual = oneSdk.individual();
      individual.addConsent();
      individual.submit({
        verify: true,
      });
    } else {
      appendToFileInfo(`Biometrics result received with unknown results`);
    }
  });

  biometrics.on("detection_failed", (error) => {
    appendToFileInfo(error);

    if (retriesAttempted < 3) {
      biometrics.mount("#biometrics-container");
    }
  });

  biometrics.on("error", ({ message, payload }) => {
    appendToFileInfo(message);
  });

  biometrics.on("ready", () => {
    // If you provided your own loading state it can now be hidden.
    showAndroidToast("Biometrics Ready");
    appendToFileInfo("Biometric Ready");
  });

  biometrics.mount("#biometrics-container");
}

function showAndroidToast(message) {
  console.log(message);
  try {
    Android.showToast(message);
  } catch (e) {
    if (e instanceof ReferenceError) {
      alert(message);
    }
  }
}

function initSmartUI() {
  frankieFinancial.initialiseOnboardingWidget({
    ffToken: sessionData.token,
    applicantReference: "ba4ab023-096d-fd7c-3767-da3fd0d7f74b",
    width: "AUTO",
    height: "AUTO",
    config: {
      frankieBackendUrl: "https://backend.latest.frankiefinancial.io",
      successScreen: {
        ctaUrl: "javascript:alert('Callback for successful onboarding')",
      },
      failureScreen: {
        ctaUrl: "javascript:alert('Callback for failed onboarding')",
      },
      documentTypes: ["DRIVERS_LICENCE", "PASSPORT", "NATIONAL_HEALTH_ID"],
      acceptedCountries: ["AUS", "NZL"],
      ageRange: [18, 125],
      organisationName: "My Organisation",
    },
  });
}
