const axios = require('axios');

async function register() {
    try {
        const response = await axios.post('http://20.207.122.201/evaluation-service/register', {
            email: "rahul_kaja@srmap.edu.in",
            name: "Rahul",
            mobileNo: "4859482123",
            githubUsername: "aagnyathavasi",
            rollNo: "AP23110010688",
            accessCode: "QkbpxH"
        });

        console.log("Registration Successful!\n");
        console.log("Here are your credentials. SAVE THESE");
        console.log(response.data);

    } catch (error) {
        console.error("❌ Registration Failed:");
        console.error(error.response ? error.response.data : error.message);
    }
}

register();
